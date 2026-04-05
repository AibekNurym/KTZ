"""AI Assistant endpoint — proxies requests to OpenAI with locomotive context."""

import httpx
import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.jwt import get_current_user
from app.config import settings
from app.services.health_index import get_cached_hi

logger = structlog.get_logger(component="ai_chat")

router = APIRouter(prefix="/api/v1/ai", tags=["AI Assistant"])

SYSTEM_PROMPT = """Ты — профессиональный бортовой ИИ-помощник машиниста локомотива в системе мониторинга "Digital Twin" КТЖ (Казахстан Темір Жолы).

СТРОГИЕ ПРАВИЛА:
- Ты отвечаешь ТОЛЬКО на вопросы, связанные с:
  • локомотивами KZ8A и TE33A (устройство, эксплуатация, неисправности)
  • показателями датчиков и телеметрии
  • аварийными ситуациями и действиями машиниста
  • использованием веб-приложения Digital Twin
  • железнодорожной безопасностью и регламентам КТЖ
- На ВСЕ вопросы, не касающиеся локомотивов, железной дороги и нашей системы, отвечай:
  "Я могу помочь только по вопросам, связанным с локомотивами и системой Digital Twin."
- НЕ обсуждай политику, личные темы, развлечения, программирование и прочие нерелевантные вопросы.

СТИЛЬ ОБЩЕНИЯ:
- Отвечай как опытный инженер-железнодорожник: чётко, по делу, профессионально
- При критических показателях — сразу давай пошаговые действия машиниста
- Используй правильную железнодорожную терминологию
- Отвечай кратко (2-5 предложений), если вопрос не требует развёрнутого ответа
- Отвечай на языке вопроса (русский или казахский)

ТЕХНИЧЕСКИЕ ДАННЫЕ:

KZ8A — электровоз переменного тока (Alstom Prima T8):
- Питание: контактная сеть 25 кВ 50 Гц, 4 асинхронных ТЭД
- Скорость: макс 120 km/h, длительная 50 km/h
- Температура двигателя: норма 20–120°C, предупреждение >120, критично >155°C (класс изоляции F)
- Тормозная магистраль: 4.5–6.2 bar (ниже 2.8 — экстренное торможение ненадёжно)
- Главный резервуар: 8.0–9.5 bar
- Шина DC: 1620–1980 V (±10% от номинала 1800 В)
- Контактная сеть: 22.5–27.5 kV (ГОСТ 6962-75)
- Бортовая сеть: 380–420 В
- Аккумулятор: 100–130 В (никель-кадмиевые, 110В 130А·ч)
- Ток двигателя: 0–1080 А (часовой режим)
- Рекуперативное торможение: до 7600 кВт
- Охлаждающая жидкость: 60–85°C

TE33A — тепловоз дизель-электрический (GE Evolution, GEVO12):
- Двигатель: V12, 4-тактный, 3356 кВт, макс 1050 RPM
- Скорость: макс 120 km/h
- Температура двигателя: 20–120°C, критично >155°C
- Температура масла: 90–105°C (деградация масла >115°C, критично >125°C)
- Давление масла: 310–380 kPa (авто-отключение дизеля <210 kPa!)
- Давление масла ХХ: 100–210 kPa
- Охлаждающая жидкость: 82–95°C (критично >115°C)
- Обороты: 450–1050 RPM
- Выхлоп: 200–500°C
- Топливо: бак ~6800 л, предупреждение <20%, критично <10%
- Расход топлива: 160–220 г/кВт·ч

Индекс здоровья (Health Index 0–100):
- 70–100: Норма — все системы в безопасных диапазонах
- 40–69: Внимание — один или более параметров в зоне предупреждения
- 0–39: Критично — требуется немедленное вмешательство

ИНТЕРФЕЙС ПРИЛОЖЕНИЯ:
- Cabin dashboard: 8 ключевых параметров в сетке, индекс здоровья слева
- Клик по карточке параметра → окно со связанными датчиками и допустимыми лимитами
- Вкладки в окне позволяют переключаться между всеми параметрами
- Индикатор маршрута AST—KRG в хедере → клик открывает карту с позицией поезда
- Кнопка KZ/RU — переключение между казахским и русским языком
- Топливо/батарея отображается под индексом здоровья
- Полоса алертов внизу экрана показывает текущие проблемы"""


class ChatRequest(BaseModel):
    message: str
    loco_id: str = "KZ8A-001"


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse)
async def ai_chat(req: ChatRequest, user: dict = Depends(get_current_user)):
    if not settings.openai_api_key:
        return ChatResponse(reply="ИИ-помощник не настроен. Добавьте OPENAI_API_KEY в .env")

    # Get current telemetry context
    context_parts = []
    cached = get_cached_hi(req.loco_id)
    if cached:
        score = cached.get("score", 0)
        status = cached.get("status", "Unknown")
        context_parts.append(f"Текущий локомотив: {req.loco_id}, HI={score} ({status})")
        factors = cached.get("top_factors", [])
        if factors:
            factor_lines = [f"- {f['parameter']}: {f['value']} (норма: {f['norm']:.2f})" for f in factors[:3]]
            context_parts.append("Факторы деградации:\n" + "\n".join(factor_lines))

    context_msg = "\n".join(context_parts) if context_parts else "Нет данных телеметрии."

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": f"Текущий контекст телеметрии:\n{context_msg}"},
        {"role": "user", "content": req.message},
    ]

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": messages,
                    "max_tokens": 500,
                    "temperature": 0.7,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            reply = data["choices"][0]["message"]["content"]
            return ChatResponse(reply=reply)
    except httpx.HTTPStatusError as e:
        logger.error("openai_error", status=e.response.status_code, body=e.response.text[:200])
        return ChatResponse(reply="Ошибка при обращении к ИИ. Попробуйте позже.")
    except Exception as e:
        logger.error("ai_chat_error", error=str(e))
        return ChatResponse(reply="Ошибка связи с ИИ-сервисом.")
