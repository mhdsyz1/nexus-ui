import os
import math
import logging
import hashlib
import asyncio
import httpx
import html
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from typing import Literal, Optional, Any
from cachetools import TTLCache
from fastapi import FastAPI, Request, status, BackgroundTasks, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
import ipaddress
from sqlalchemy import text

from trading_state import process_engine_state, AsyncSessionLocal
from telegram_bot import broadcast_trade, broadcast_parole_restoration, _get_bot, TELEGRAM_CHAT_ID

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("middleware_layer")

# ============================================================
# ENVIRONMENT & INFRASTRUCTURE CONFIGURATION
# ============================================================
idempotency_cache = TTLCache(maxsize=1000, ttl=60)
WEBHOOK_SECRET_TOKEN = os.getenv("WEBHOOK_SECRET_TOKEN")
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
MIN_SIGNAL_SCORE = 50 

TRADINGVIEW_IPS = [
    ipaddress.ip_network("52.89.214.238/32"),
    ipaddress.ip_network("34.212.75.30/32"),
    ipaddress.ip_network("54.218.53.128/32"),
    ipaddress.ip_network("52.32.178.7/32")
]

# ============================================================
# PYDANTIC SCHEMAS (HOISTED TO FIX CRASH LOOP)
# ============================================================
class KillSwitchPayload(BaseModel):
    action: Literal["ACTIVATE", "DEACTIVATE"]

class TradeResolution(BaseModel):
    secret_token: str
    trade_id: str
    outcome: Literal["WIN", "LOSS", "BREAKEVEN", "DROPPED", "SKIPPED"]
    pnl_amount: Optional[float] = 0.0

class LayerResolution(BaseModel):
    secret_token: str
    layer_id: str
    trade_id: str
    layer_type: Literal["T1", "T2", "T3"]
    outcome: Literal["HIT", "STOPPED_BE", "STOPPED_SL", "DROPPED"]
    pnl_amount: Optional[float] = 0.0

class TradingViewPayload(BaseModel):
    secret_token: str
    ticker: str
    timeframe: str = "Unknown"
    # STRICT VALIDATION: Explicitly permitting Ghost Zone invalidations
    action: Literal["BUY", "SELL", "BUY NOW", "SELL NOW", "INVALIDATED_ZONE", "EXECUTE"] = "EXECUTE"
    timestamp: int = 0
    score: float = 0.0
    market_regime: str = "Unknown"
    volume_delta: float = 0.0
    magnet_node: float = 0.0
    zone_high: float = 0.0
    zone_low: float = 0.0
    entry_price: float = 0.0
    stop_loss: float = 0.0
    take_profit: float = 0.0

    @model_validator(mode="before")
    @classmethod
    def sanitize_tv_nulls(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for key in ['magnet_node', 'volume_delta', 'market_regime']:
                val = data.get(key)
                if val is None:
                    data[key] = 0.0 if key != 'market_regime' else "Unknown"
                elif isinstance(val, str) and val.upper() == "NAN":
                    data[key] = 0.0
                elif isinstance(val, float) and math.isnan(val):
                    data[key] = 0.0
        return data

    @model_validator(mode="after")
    def validate_zone_geometry(self) -> "TradingViewPayload":
        sl, tp, zh, zl = self.stop_loss, self.take_profit, self.zone_high, self.zone_low
        # Skip validation bounds for invalidation coordinates
        if self.action != "INVALIDATED_ZONE" and zh < zl:
            raise ValueError("Invalid Boundaries")
        return self

# ============================================================
# PHASE 3.1 & 3.3: KINETIC EVENT PROTOCOL (MACRO & STRIKE ENGINE)
# ============================================================
RED_FOLDER_SCHEDULE: list[dict[str, Any]] = []

HIGH_IMPACT_KEYWORDS = [
    "CPI", "NFP", "NON-FARM", "FOMC", "FEDERAL FUNDS RATE", 
    "UNEMPLOYMENT RATE", "PPI", "RETAIL SALES"
]

def get_event_thresholds(event_name: str) -> tuple[float, bool]:
    """Maps macro event names to their required Delta threshold and directional logic."""
    name_upper = event_name.upper()
    if "CPI" in name_upper:
        return 0.2, False
    elif "NFP" in name_upper or "NON-FARM" in name_upper:
        return 40.0, False
    elif "UNEMPLOYMENT" in name_upper:
        return 0.2, True  # Higher Unemployment = Weak USD = BUY Gold
    elif "RETAIL SALES" in name_upper:
        return 0.5, False
    elif "PPI" in name_upper:
        return 0.3, False
    return 0.1, False

async def execute_kinetic_delta_strike(event: dict[str, Any]):
    """
    Phase 3.3: High-Frequency News Worker using httpx.
    Hibernates until T-10s, polls Finnhub every 500ms, calculates Delta deviation,
    and executes an isolated $50 Burner execution payload.
    """
    event_name = event["event_name"]
    target_time = event["target_time"]
    forecast = float(event["forecast"]) if event.get("forecast") is not None else 0.0
    threshold = float(event.get("threshold", 0.1))
    reverse_logic = event.get("reverse_logic", False)

    now_ts = int(datetime.now(timezone.utc).timestamp())
    sleep_duration = (target_time - 10) - now_ts

    # 1. Hibernation Check
    if sleep_duration < -60:
        logger.warning(f"KINETIC STRIKE SKIPPED: {event_name} is in the past (>60s elapsed).")
        return

    if sleep_duration > 0:
        logger.info(f"KINETIC STRIKE ARMED: {event_name}. Hibernating for {sleep_duration}s until T-10s.")
        await asyncio.sleep(sleep_duration)

    logger.info(f"KINETIC STRIKE AWAKENED: Initiating 500ms polling cycle for {event_name}...")

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    url = f"https://finnhub.io/api/v1/economic-calendar?from={today_str}&to={today_str}&token={FINNHUB_API_KEY}"

    # 2. Polling Loop using httpx.AsyncClient (80 cycles x 500ms = 40 seconds max lifespan)
    async with httpx.AsyncClient(timeout=3.0) as client:
        for attempt in range(80):
            try:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    events = data.get("economicCalendar", [])
                    
                    target_data = None
                    for item in events:
                        if item.get("event", "").upper() == event_name.upper():
                            target_data = item
                            break

                    # 3. Condition Checking
                    if target_data and target_data.get("actual") is not None:
                        actual = float(target_data["actual"])
                        delta = actual - forecast

                        # Invalidation check: Abort if deviation is priced in
                        if abs(delta) < threshold:
                            logger.info(f"KINETIC STRIKE ABORT: {event_name} Delta ({delta:+.4f}) < Threshold (±{threshold}). PRICED IN.")
                            return

                        # Direction Logic
                        if not reverse_logic:
                            action = "SELL NOW" if delta > 0 else "BUY NOW"
                        else:
                            action = "BUY NOW" if delta > 0 else "SELL NOW"

                        # Isolated $50 Burner Sizing (1.5 point SL cushion)
                        burner_equity = 50.00
                        sl_distance = 1.5
                        pip_multiplier = 100.0
                        lot_size = burner_equity / (sl_distance * pip_multiplier)

                        logger.critical(
                            f"🔥 [KINETIC STRIKE TRIGGERED] {event_name} | Action: {action} | "
                            f"Actual: {actual} | Forecast: {forecast} | Delta: {delta:+.4f} | Size: {lot_size:.2f} Lots"
                        )

                        # Dispatch Telegram notification
                        if TELEGRAM_CHAT_ID:
                            bot = _get_bot()
                            msg = (
                                f"🔥 <b>KINETIC DELTA STRIKE EXECUTED</b>\n"
                                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                f"<b>EVENT</b>    : <code>{html.escape(event_name)}</code>\n"
                                f"<b>ACTION</b>   : <code>{action} (XAUUSD)</code>\n"
                                f"<b>ACTUAL</b>   : <code>{actual}</code> (Forecast: <code>{forecast}</code>)\n"
                                f"<b>DELTA</b>    : <code>{delta:+.4f}</code> (Threshold: <code>±{threshold}</code>)\n"
                                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                                f"<b>BURNER SIZE</b> : <code>{lot_size:.2f} Lots</code> ($50.00 Max Risk)\n"
                                f"<i>⚡ High-Frequency Kinetic Event Protocol</i>"
                            )
                            asyncio.create_task(bot.send_message(chat_id=TELEGRAM_CHAT_ID, text=msg, parse_mode="HTML"))

                        return  # Kill task immediately after execution

            except Exception as e:
                logger.error(f"Error polling Finnhub in strike loop: {str(e)}")

            await asyncio.sleep(0.5)  # Enforce strict 500ms cadence

    logger.warning(f"KINETIC STRIKE TIMEOUT: {event_name} actual data was not published within 40 seconds.")

async def fetch_daily_macro_calendar():
    """Queries Finnhub REST API for current day high-impact USD events, populates schedule, and spawns Strike Workers."""
    global RED_FOLDER_SCHEDULE
    if not FINNHUB_API_KEY:
        logger.error("FINNHUB_API_KEY is missing from environment variables. Macro ingestion disabled.")
        return

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    url = f"https://finnhub.io/api/v1/economic-calendar?from={today_str}&to={today_str}&token={FINNHUB_API_KEY}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            if response.status_code != 200:
                logger.error(f"Finnhub API error ({response.status_code}): {response.text}")
                return

            data = response.json()
            events = data.get("economicCalendar", [])
            
            new_schedule = []
            for item in events:
                country = item.get("country", "").upper()
                event_name = item.get("event", "").upper()
                impact = item.get("impact", "").lower()

                is_usd = country in ["US", "USD"]
                is_high_impact = impact == "high" or any(kw in event_name for kw in HIGH_IMPACT_KEYWORDS)

                if is_usd and is_high_impact:
                    time_str = item.get("time") # Format: "YYYY-MM-DD HH:MM:SS" (UTC)
                    if not time_str:
                        continue

                    event_dt = datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                    event_ts = int(event_dt.timestamp())
                    
                    # 20-Minute Embargo Window: T-15m to T+5m
                    embargo_start_ts = event_ts - (15 * 60)
                    embargo_end_ts = event_ts + (5 * 60)

                    threshold, reverse_logic = get_event_thresholds(event_name)

                    event_entry = {
                        "event_id": f"{event_name.lower().replace(' ', '_')}_{event_ts}",
                        "event_name": item.get("event"),
                        "timestamp_utc": event_ts,
                        "time_str": time_str,
                        "forecast": item.get("estimate"),
                        "previous": item.get("prev"),
                        "actual": item.get("actual"),
                        "unit": item.get("unit", ""),
                        "embargo_start": embargo_start_ts,
                        "embargo_end": embargo_end_ts,
                        "processed": False
                    }
                    new_schedule.append(event_entry)

                    # TASK SPAWNER: Launch Delta Strike Worker for upcoming events with forecast numbers
                    if item.get("estimate") is not None:
                        strike_payload = {
                            "event_name": item.get("event"),
                            "target_time": event_ts,
                            "forecast": item.get("estimate"),
                            "threshold": threshold,
                            "reverse_logic": reverse_logic
                        }
                        asyncio.create_task(execute_kinetic_delta_strike(strike_payload))

            RED_FOLDER_SCHEDULE = new_schedule
            logger.info(f"Macro Ingestion Engine: Loaded {len(RED_FOLDER_SCHEDULE)} USD Red Folder events for {today_str}.")

    except Exception as e:
        logger.error(f"Failed to execute Finnhub macro ingestion: {str(e)}")

async def macro_ingestion_worker():
    """Background loop: Fetches macro schedule on startup, then sleeps until 00:01 UTC daily."""
    logger.info("Macro Ingestion Background Worker initiated.")
    await fetch_daily_macro_calendar()

    while True:
        try:
            now = datetime.now(timezone.utc)
            tomorrow = now.date() + timedelta(days=1)
            next_run = datetime(tomorrow.year, tomorrow.month, tomorrow.day, 0, 1, 0, tzinfo=timezone.utc)
            sleep_seconds = (next_run - now).total_seconds()

            logger.info(f"Macro Ingestion Worker sleeping for {sleep_seconds / 3600.0:.2f} hours until next 00:01 UTC cycle.")
            await asyncio.sleep(sleep_seconds)
            await fetch_daily_macro_calendar()

        except asyncio.CancelledError:
            logger.info("Macro Ingestion Worker gracefully cancelled.")
            break
        except Exception as e:
            logger.error(f"Error in Macro Ingestion Worker loop: {str(e)}")
            await asyncio.sleep(300)

# ============================================================
# PHASE 2.1: AUTOMATED 12-HOUR PAROLE WORKER
# ============================================================
async def automated_parole_worker():
    """Checks every 5 minutes if a 12-hour kill switch penalty has expired and self-restores."""
    logger.info("Automated 12-Hour Parole Worker initiated.")
    while True:
        try:
            await asyncio.sleep(300)
            async with AsyncSessionLocal() as session:
                fetch_query = text("""
                    SELECT id, system_is_killed, killed_at 
                    FROM risk_configuration 
                    ORDER BY id DESC LIMIT 1
                """)
                res = await session.execute(fetch_query)
                config = res.fetchone()

                if config and config.system_is_killed and config.killed_at:
                    now = datetime.now(timezone.utc)
                    killed_time = config.killed_at if config.killed_at.tzinfo else config.killed_at.replace(tzinfo=timezone.utc)
                    elapsed_hours = (now - killed_time).total_seconds() / 3600.0

                    if elapsed_hours >= 12.0:
                        async with session.begin():
                            restore_query = text("""
                                UPDATE risk_configuration 
                                SET system_is_killed = false, killed_at = NULL 
                                WHERE id = :id
                            """)
                            await session.execute(restore_query, {"id": config.id})
                        
                        logger.info(f"12-Hour Parole satisfied (Elapsed: {elapsed_hours:.2f}h). System restored.")
                        await broadcast_parole_restoration()

        except asyncio.CancelledError:
            logger.info("Parole worker background loop cancelled gracefully.")
            break
        except Exception as e:
            logger.error(f"Error in parole worker execution cycle: {str(e)}")

# ============================================================
# PHASE 4: GHOST ZONE MEMORY (INVERTED BREAKER CORTEX)
# ============================================================
async def process_invalidated_zone(payload: TradingViewPayload):
    """
    Parses breached order blocks, inverts their transactional polarity,
    and stores them inside the database cortex as structural Breakers.
    """
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                if payload.entry_price < payload.zone_low:
                    original_type = "BULLISH"
                    breaker_type = "BEARISH"
                else:
                    original_type = "BEARISH"
                    breaker_type = "BULLISH"
                
                # FIXED: Mapped spatial coordinates to breaker_high/breaker_low and defaulted is_active to true
                query = text("""
                    INSERT INTO ghost_zones (ticker, timeframe, breaker_high, breaker_low, original_type, breaker_type, invalidated_at, is_active)
                    VALUES (:ticker, :timeframe, :breaker_high, :breaker_low, :original_type, :breaker_type, NOW(), true)
                """)
                
                await session.execute(query, {
                    "ticker": payload.ticker,
                    "timeframe": payload.timeframe,
                    "breaker_high": payload.zone_high,
                    "breaker_low": payload.zone_low,
                    "original_type": original_type,
                    "breaker_type": breaker_type
                })
                
                logger.info(
                    f"👻 [Ghost Zone Activated] {payload.ticker} {payload.timeframe} | "
                    f"Original Polarity: {original_type} -> Breaker Polarity: {breaker_type} | "
                    f"Coordinates: {payload.zone_low:.2f} - {payload.zone_high:.2f}"
                )
    except Exception as e:
        logger.error(f"Fatal error routing invalidation payload to ghost_zones: {str(e)}")

# ============================================================
# FASTAPI LIFESPAN MANAGEMENT
# ============================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    parole_task = asyncio.create_task(automated_parole_worker())
    macro_ingestion_task = asyncio.create_task(macro_ingestion_worker())
    
    yield
    
    parole_task.cancel()
    macro_ingestion_task.cancel()
    try:
        await asyncio.gather(parole_task, macro_ingestion_task, return_exceptions=True)
    except asyncio.CancelledError:
        pass

# ============================================================
# SECURITY & AUTHENTICATION HELPERS
# ============================================================
def is_ip_allowed(ip_str: str) -> bool:
    try:
        ip_obj = ipaddress.ip_address(ip_str)
        return any(ip_obj in network for network in TRADINGVIEW_IPS)
    except ValueError:
        return False

async def verify_admin_key(request: Request):
    key = request.headers.get("X-Admin-Key")
    if key != WEBHOOK_SECRET_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid Secret Token")
    return key

# ============================================================
# FASTAPI APPLICATION & MIDDLEWARE
# ============================================================
app = FastAPI(title="Neural Nexus Middleware", version="3.7.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://mhdsyz1.github.io"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def enforce_ip_whitelist(request: Request, call_next):
    # FIXED: Extract Real IP through Railway's Reverse Proxy
    if request.url.path == "/webhook":
        forwarded_for = request.headers.get("x-forwarded-for")
        
        if forwarded_for:
            # Railway appends multiple proxy IPs, extract the initial client IP
            client_ip = forwarded_for.split(",")[0].strip()
        else:
            client_ip = request.client.host
            
        if not is_ip_allowed(client_ip) and client_ip not in ["127.0.0.1", "testclient"]:
            logger.warning(f"Unauthorized IP rejected: {client_ip}")
            return JSONResponse(status_code=403, content={"detail": "Access Denied / Unauthorized Origin"})
            
    return await call_next(request)

# ============================================================
# BACKGROUND PIPELINES & ROUTES
# ============================================================
async def background_execution_pipeline(payload: TradingViewPayload):
    try:
        engine_res = await process_engine_state(payload)
        if engine_res.is_blocked:
            logger.warning(f"Engine blocked execution for {payload.ticker}. Kill switch is ACTIVE.")
            return
        await broadcast_trade(payload, engine_res)
    except Exception as e:
        logger.error(f"Fatal handling error in background pipeline: {str(e)}")

@app.get("/api/macro-schedule", status_code=status.HTTP_200_OK)
async def get_macro_schedule(admin_key: str = Depends(verify_admin_key)):
    """Returns the live in-memory Red Folder schedule for today."""
    return {
        "status": "success",
        "event_count": len(RED_FOLDER_SCHEDULE),
        "schedule": RED_FOLDER_SCHEDULE
    }

@app.post("/api/resolve-layer", status_code=status.HTTP_200_OK)
async def resolve_layer(payload: LayerResolution):
    if payload.secret_token != WEBHOOK_SECRET_TOKEN:
        raise HTTPException(status_code=403, detail="Unauthorized")

    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                update_layer = text("""
                    UPDATE trade_layers 
                    SET status = :outcome, realized_pnl = :pnl, closed_at = NOW() 
                    WHERE id = :layer_id
                """)
                await session.execute(update_layer, {
                    "outcome": payload.outcome, 
                    "pnl": payload.pnl_amount, 
                    "layer_id": payload.layer_id
                })

                fetch_all = text("SELECT status, realized_pnl FROM trade_layers WHERE trade_id = :trade_id")
                res = await session.execute(fetch_all, {"trade_id": payload.trade_id})
                layers = res.fetchall()

                all_closed = all(l[0] != 'PENDING' for l in layers)

                if all_closed:
                    total_pnl = sum(float(l[1] or 0.0) for l in layers)
                    statuses = [l[0] for l in layers]

                    if all(s == 'STOPPED_SL' for s in statuses):
                        parent_status = "LOSS"
                    elif any(s == 'HIT' for s in statuses):
                        parent_status = "WIN"
                    elif all(s in ['STOPPED_BE', 'DROPPED'] for s in statuses):
                        parent_status = "BREAKEVEN" if any(s == 'STOPPED_BE' for s in statuses) else "DROPPED"
                    else:
                        parent_status = "WIN" if total_pnl > 0 else "LOSS" if total_pnl < 0 else "BREAKEVEN"

                    update_parent = text("""
                        UPDATE execution_queue 
                        SET status = :status, realized_pnl = :pnl, processed_at = NOW() 
                        WHERE id = :trade_id
                    """)
                    await session.execute(update_parent, {
                        "status": parent_status, 
                        "pnl": total_pnl, 
                        "trade_id": payload.trade_id
                    })

                    if parent_status == "LOSS":
                        fetch_recent = text("""
                            SELECT status FROM execution_queue 
                            WHERE status IN ('WIN', 'LOSS', 'BREAKEVEN') 
                            ORDER BY created_at DESC LIMIT 2
                        """)
                        recent_res = await session.execute(fetch_recent)
                        recent_trades = recent_res.fetchall()

                        if len(recent_trades) == 2 and recent_trades[0][0] == "LOSS" and recent_trades[1][0] == "LOSS":
                            kill_query = text("""
                                UPDATE risk_configuration 
                                SET system_is_killed = true, killed_at = NOW() 
                                WHERE id IN (
                                    SELECT id FROM risk_configuration ORDER BY id DESC LIMIT 1
                                )
                            """)
                            await session.execute(kill_query)
                            logger.warning("DISCIPLINE ENGINE: Two consecutive losses recorded. System HALTED for 12 hours.")

        return {"status": "success", "all_closed": all_closed}
    except Exception as e:
        logger.error(f"Layer resolution failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Layer resolution failed.")

@app.post("/api/resolve-trade", status_code=status.HTTP_200_OK)
async def resolve_trade(payload: TradeResolution):
    if payload.secret_token != WEBHOOK_SECRET_TOKEN:
        raise HTTPException(status_code=403, detail="Unauthorized")

    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                update_query = text("UPDATE execution_queue SET status = :outcome, realized_pnl = :pnl WHERE id = :trade_id")
                await session.execute(update_query, {"outcome": payload.outcome, "pnl": payload.pnl_amount, "trade_id": payload.trade_id})
                
                update_child_layers = text("""
                    UPDATE trade_layers 
                    SET status = CASE 
                        WHEN :outcome = 'WIN' THEN 'HIT' 
                        WHEN :outcome = 'LOSS' THEN 'STOPPED_SL' 
                        WHEN :outcome = 'BREAKEVEN' THEN 'STOPPED_BE' 
                        ELSE 'DROPPED' END,
                        closed_at = NOW()
                    WHERE trade_id = :trade_id AND status = 'PENDING'
                """)
                await session.execute(update_child_layers, {"outcome": payload.outcome, "trade_id": payload.trade_id})

                if payload.outcome == "LOSS":
                    fetch_query = text("""
                        SELECT status FROM execution_queue 
                        WHERE status IN ('WIN', 'LOSS', 'BREAKEVEN') 
                        ORDER BY created_at DESC LIMIT 2
                    """)
                    res = await session.execute(fetch_query)
                    recent_trades = res.fetchall()
                    
                    if len(recent_trades) == 2 and recent_trades[0][0] == "LOSS" and recent_trades[1][0] == "LOSS":
                        kill_query = text("""
                            UPDATE risk_configuration 
                            SET system_is_killed = true, killed_at = NOW() 
                            WHERE id IN (
                                SELECT id FROM risk_configuration ORDER BY id DESC LIMIT 1
                            )
                        """)
                        await session.execute(kill_query)
                        logger.warning("SYSTEM KILLED: Two consecutive losses recorded. Stamp set for 12-hour parole.")
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Backend execution failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Backend execution failed.")

@app.post("/api/kill-switch", status_code=status.HTTP_200_OK)
async def admin_kill_switch(payload: KillSwitchPayload, admin_key: str = Depends(verify_admin_key)):
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                kill_status = True if payload.action == "ACTIVATE" else False
                update_query = text("""
                    UPDATE risk_configuration 
                    SET system_is_killed = :status,
                        killed_at = CASE WHEN :status = true THEN NOW() ELSE NULL END 
                    WHERE id IN (
                        SELECT id FROM risk_configuration ORDER BY id DESC LIMIT 1
                    )
                """)
                await session.execute(update_query, {"status": kill_status})
        return {"status": "success", "message": f"System Kill Switch set to {kill_status}"}
    except Exception as e:
        logger.error(f"Failed to execute kill switch: {str(e)}")
        raise HTTPException(status_code=500, detail="Database update failed.")

def is_macro_embargo_active() -> tuple[bool, Optional[str]]:
    """Checks if current time falls within any active event embargo window (T-15m to T+5m)."""
    now_ts = int(datetime.now(timezone.utc).timestamp())
    for event in RED_FOLDER_SCHEDULE:
        if event["embargo_start"] <= now_ts <= event["embargo_end"]:
            return True, event["event_name"]
    return False, None

@app.post("/webhook", status_code=status.HTTP_202_ACCEPTED)
async def handle_inbound_alert(payload: TradingViewPayload, background_tasks: BackgroundTasks):
    # 0. Authenticate Webhook
    if payload.secret_token != WEBHOOK_SECRET_TOKEN:
        return JSONResponse(status_code=401, content={"detail": "Invalid Token."})

    # 1. INTERCEPT: Handle Invalidation Events
    if payload.action == "INVALIDATED_ZONE":
        background_tasks.add_task(process_invalidated_zone, payload)
        return {"status": "success", "detail": "Invalidation event routed to Ghost Cortex."}

    # 2. PHASE 3.2: PRE-EVENT EMBARGO SHIELD
    is_embargoed, active_event = is_macro_embargo_active()
    if is_embargoed:
        logger.warning(f"EMBARGO SHIELD ACTIVE: Dropped SMC webhook for {payload.ticker} during high-impact news ({active_event}).")
        return JSONResponse(
            status_code=423, 
            content={"detail": f"Macro Embargo Active: {active_event}. Main execution queue shielded."}
        )

    # 3. Catch Pre-Alerts (-1), broadcast to Telegram, then DROP before DB insertion
    if payload.score == -1:
        from trading_state import EngineContextResult
        dummy_context = EngineContextResult("", 0, False, 250.0, 0.02, 0.04, 0.06)
        background_tasks.add_task(broadcast_trade, payload, dummy_context)
        return JSONResponse(status_code=202, content={"detail": "Squeeze pre-alert routed to Telegram only."})

    # 4. Reject weak setups
    if payload.score is not None and payload.score >= 0 and payload.score < MIN_SIGNAL_SCORE:
        return JSONResponse(status_code=406, content={"detail": "Signal score below threshold."})

    # ============================================================
    # PHASE 5: STATISTICAL PROBABILITY EDGE SCORING (Supabase RPC)
    # ============================================================
    try:
        async with AsyncSessionLocal() as session:
            rpc_query = text("""
                SELECT calculate_dynamic_edge_score(:regime, :delta)
            """)
            res = await session.execute(rpc_query, {
                "regime": payload.market_regime,
                "delta": payload.volume_delta
            })
            historical_edge_score = res.scalar()

            # Fallback to payload score if RPC returns null or hasn't accumulated enough historical data yet
            if historical_edge_score is not None:
                logger.info(f"📊 PHASE 5 EDGE SCORE EVALUATION: {payload.ticker} scored {historical_edge_score}/100 via Supabase RPC stats.")
                
                # Hard override: Reject signals where historical probability drops below personal threshold
                if historical_edge_score < MIN_SIGNAL_SCORE:
                    return JSONResponse(
                        status_code=406,
                        content={"detail": f"Statistical Edge Rejection: Historical confidence score ({historical_edge_score}) is below required threshold."}
                    )
            else:
                logger.info(f"📊 PHASE 5: Insufficient historical data for regime '{payload.market_regime}' and delta '{payload.volume_delta}'. Falling back to local score: {payload.score}")
                if payload.score < MIN_SIGNAL_SCORE:
                    return JSONResponse(
                        status_code=406,
                        content={"detail": "Signal score below threshold."}
                    )
    except Exception as e:
        logger.error(f"Error evaluating Phase 5 statistical edge score via RPC: {str(e)}")
        # Graceful fallback to static score check if database function fails
        if payload.score < MIN_SIGNAL_SCORE:
            return JSONResponse(
                status_code=406,
                content={"detail": "Signal score below threshold."}
            )

    # 5. PHASE 4: CASCADE INDUCEMENT TRACKER (Liquidity Trap Prevention)
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                # Query matching pending zones within a tight dynamic ±2.0 point boundary
                spatial_check_query = text("""
                    SELECT id, touch_count FROM execution_queue
                    WHERE ticker = :ticker AND status = 'PENDING'
                    AND ABS(zone_high - :zone_high) <= 2.0
                    AND ABS(zone_low - :zone_low) <= 2.0
                    ORDER BY created_at DESC LIMIT 1
                """)
                res = await session.execute(spatial_check_query, {
                    "ticker": payload.ticker,
                    "zone_high": payload.zone_high,
                    "zone_low": payload.zone_low
                })
                existing_zone = res.fetchone()

                if existing_zone:
                    zone_id, current_touches = existing_zone
                    new_touches = current_touches + 1

                    # Commit incremented touch count to state machine DB
                    update_touches = text("""
                        UPDATE execution_queue
                        SET touch_count = :new_touches
                        WHERE id = :zone_id
                    """)
                    await session.execute(update_touches, {
                        "new_touches": new_touches,
                        "zone_id": zone_id
                    })

                    logger.info(f"⚡ Spatial overlap found for {payload.ticker}. Incrementing touch count to {new_touches} on Zone ID: {zone_id}")

                    # INTERRUPT TRIGGER: Exceeded maximum allowed tests on dynamic zones without a BOS structure shift
                    if new_touches >= 3:
                        logger.critical(
                            f"🛑 Spatial Area "
                            f"({payload.zone_low:.2f} - {payload.zone_high:.2f}) was tested {new_touches} times. "
                            f"Execution blocked for {payload.ticker}."
                        )
                        return JSONResponse(
                            status_code=status.HTTP_423_LOCKED,
                            content={"detail": "Cascade Inducement Trap: Dynamic zone tested more than twice without breaking structure."}
                        )
    except Exception as e:
        logger.error(f"Error handling Cascade Inducement processing sequence: {str(e)}")

    # 6. Spatial Deduplication Lock (Blocks duplicate alerts within a 2.0 point radius)
    is_duplicate = False
    for cached_key, cached_data in idempotency_cache.items():
        if cached_data["ticker"] == payload.ticker:
            if abs(cached_data["zh"] - payload.zone_high) <= 2.0 and abs(cached_data["zl"] - payload.zone_low) <= 2.0:
                is_duplicate = True
                break

    if is_duplicate:
        logger.info(f"Dropped duplicate spatial signal near {payload.zone_high:.2f} - {payload.zone_low:.2f}")
        return JSONResponse(status_code=409, content={"detail": "Duplicate spatial signal."})

    # 7. Approve and route to execution queue
    unique_cache_key = f"{payload.ticker}_{payload.timestamp}"
    idempotency_cache[unique_cache_key] = {"ticker": payload.ticker, "zh": payload.zone_high, "zl": payload.zone_low}
    background_tasks.add_task(background_execution_pipeline, payload)
    return {"status": "success"}