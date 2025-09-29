import random
import string
import time
from uuid import uuid4
from flask import Flask, jsonify, request
from flask_cors import CORS
import openai 
import os 
from dotenv import find_dotenv, load_dotenv
import re 
import json

app = Flask(__name__)
CORS(app)

# Load environment variables - be explicit about the path
script_dir = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(script_dir, '.env')

# Fallback to find_dotenv if explicit path doesn't work
if not os.path.exists(dotenv_path):
    dotenv_path = find_dotenv()

load_dotenv(dotenv_path)
API_KEY = os.getenv("api_key")

# Configure OpenAI client
client = openai.Client(api_key=API_KEY)


ITEM_TEMPLATES = [
    {
        "id": "whimsical-museum",
        "name": "Whimsical Museum",
        "description": "Curated oddities with unpredictable worth.",
        "items": [
            {"emoji": "🖼️", "name": "Mysterious Portrait", "value": 620},
            {"emoji": "🪄", "name": "Cracked Wand", "value": 240},
            {"emoji": "🧸", "name": "Vintage Plush Bear", "value": 410},
            {"emoji": "💎", "name": "Clouded Gem", "value": 790},
            {"emoji": "📯", "name": "Forgotten Bugle", "value": 360},
        ],
    },
    {
        "id": "space-salvage",
        "name": "Space Salvage",
        "description": "Relics retrieved from deep-space junkyards.",
        "items": [
            {"emoji": "🚀", "name": "Retro Thruster", "value": 550},
            {"emoji": "👽", "name": "Alien Trinket", "value": 300},
            {"emoji": "🛰️", "name": "Mini Satellite", "value": 480},
            {"emoji": "🪐", "name": "Orbital Pebble", "value": 210},
            {"emoji": "🪫", "name": "Depleted Power Core", "value": 670},
        ],
    },
    {
        "id": "retro-yard-sale",
        "name": "Retro Yard Sale",
        "description": "Odd bargains from decades past.",
        "items": [
            {"emoji": "📼", "name": "Rare VHS", "value": 290},
            {"emoji": "🎮", "name": "Handheld Console", "value": 510},
            {"emoji": "☎️", "name": "Rotary Phone", "value": 340},
            {"emoji": "🧦", "name": "Mismatched Socks", "value": 120},
            {"emoji": "📻", "name": "Tinny Radio", "value": 410},
        ],
    },
]

INITIAL_BALANCE = 1000


games = {}


def generate_game_id():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


def generate_player_id():
    return uuid4().hex



def generate_theme_from_user_input(user_input: str, default_items: int = 15):
    match = re.search(r'(\d+)', user_input)
    num_items = int(match.group(1)) if match else default_items

    prompt = f"""
    Generate a themed auction collection for a blind-bidding game.
    Theme (from user): {user_input}
    Number of items: {num_items}

    Output format (JSON only):
    {{
      "id": "<machine-readable-id>",
      "name": "<Theme Name>",
      "description": "<short description>",
      "items": [
        {{"emoji": "X", "name": "Item Name", "value": number}},
        ...
      ]
    }}

    Rules:
    - Use fitting emojis.
    - Values between 100 and 1000.
    - Ensure varied values (not all clustered).
    - Return ONLY valid JSON, no explanations.
    """

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
        max_tokens=600,
        response_format={"type": "json_object"}
    )

    return json.loads(response.choices[0].message.content)


@app.route("/generate-theme", methods=["POST"])
def generate_theme():
    """
    Example request:
    curl -X POST http://localhost:5000/generate-theme \
         -H "Content-Type: application/json" \
         -d '{"prompt": "generate me items for a soccer theme"}'
    """
    data = request.get_json()
    if not data or "prompt" not in data:
        return jsonify({"error": "Missing 'prompt' in request body"}), 400

    user_prompt = data["prompt"]

    try:
        theme = generate_theme_from_user_input(user_prompt)
        return jsonify(theme)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

def make_item(item):
    return {
        "id": uuid4().hex,
        "emoji": item.get("emoji", "❓"),
        "name": item.get("name", "Mystery Item"),
        "value": int(item.get("value", 0)),
    }


def resolve_round(game):
    bids = game["current_bids"]
    if not bids:
        return

    current_index = game["current_index"]
    item = game["items"][current_index]
    winning_player_id, winning_amount = max(
        bids.items(), key=lambda entry: (entry[1], -game["players"][entry[0]]["joined_at"])
    )

    winner = game["players"][winning_player_id]
    item_value = item["value"]
    net_gain = item_value - winning_amount
    winner["balance"] += net_gain
    winner["wins"].append(
        {
            "itemId": item["id"],
            "name": item["name"],
            "emoji": item["emoji"],
            "value": item_value,
            "bid": winning_amount,
            "netGain": net_gain,
        }
    )

    summary = {
        "item": {
            "id": item["id"],
            "name": item["name"],
            "emoji": item["emoji"],
            "value": item_value,
        },
        "winningBid": winning_amount,
        "winner": {
            "id": winner["id"],
            "name": winner["name"],
        },
        "netGain": net_gain,
        "roundIndex": current_index,
        "timestamp": int(time.time()),
    }

    game["history"].append(summary)
    game["round_summary"] = summary
    game["round_phase"] = "reveal"
    game["current_bids"] = {}


def serialize_game(game, player_id):
    player = game["players"].get(player_id)
    players_snapshot = [
        {
            "id": p["id"],
            "name": p["name"],
            "balance": p["balance"],
            "isHost": p["id"] == game["host_id"],
        }
        for p in game["players"].values()
    ]

    players_snapshot.sort(key=lambda p: game["players"][p["id"]]["joined_at"])

    if player_id == game["host_id"] or game["round_phase"] != "reveal":
        history_view = list(game["history"])
    else:
        history_view = list(game["history"][:-1]) if game["history"] else []

    payload = {
        "gameId": game["id"],
        "status": game["status"],
        "players": players_snapshot,
        "roundPhase": game["round_phase"],
        "currentIndex": game["current_index"],
        "totalItems": len(game["items"]),
        "isHost": player_id == game["host_id"],
        "history": history_view,
    }
    
    if player:
        payload["player"] = {
            "id": player["id"],
            "name": player["name"],
            "balance": player["balance"],
        }

    if game["status"] == "in_progress":
        current_item = game["items"][game["current_index"]]
        payload["currentItem"] = {
            "id": current_item["id"],
            "name": current_item["name"],
            "emoji": current_item["emoji"],
            "index": game["current_index"],
        }

        if game["round_phase"] == "reveal" and player_id == game["host_id"]:
            payload["roundSummary"] = game["round_summary"]
    elif game["status"] == "completed":
        standings = sorted(
            (
                {
                    "id": p["id"],
                    "name": p["name"],
                    "balance": p["balance"],
                }
                for p in game["players"].values()
            ),
            key=lambda entry: entry["balance"],
            reverse=True,
        )
        payload["results"] = {
            "standings": standings,
            "winner": standings[0] if standings else None,
        }
        payload["roundSummary"] = game["round_summary"]
    return payload


def ensure_game(game_id):
    game = games.get(game_id)
    if not game:
        return None, (jsonify({"error": "Game not found"}), 404)
    return game, None


@app.get("/api/templates")
def get_templates():
    return jsonify({"templates": ITEM_TEMPLATES})


@app.post("/api/games")
def create_game():
    data = request.get_json() or {}
    host_name = (data.get("hostName") or "Host").strip()
    template_id = data.get("templateId")
    custom_items = data.get("items") or []
    generated_items = data.get("generatedItems") or []

    if not host_name:
        return jsonify({"error": "Host name is required"}), 400

    items_source = []
    if template_id:
        template = next((tmpl for tmpl in ITEM_TEMPLATES if tmpl["id"] == template_id), None)
        if not template:
            return jsonify({"error": "Template not found"}), 404
        items_source = template["items"]
    elif custom_items:
        items_source = custom_items
    else:
        return jsonify({"error": "Template or custom items required"}), 400

    prepared_items = []
    for raw_item in items_source:
        try:
            value = int(raw_item.get("value"))
        except (TypeError, ValueError):
            return jsonify({"error": "Item values must be numbers"}), 400
        prepared_items.append(
            make_item(
                {
                    "emoji": raw_item.get("emoji") or "❓",
                    "name": (raw_item.get("name") or "Mystery Item").strip()[:40],
                    "value": value,
                }
            )
        )

    if not prepared_items:
        return jsonify({"error": "At least one item is required"}), 400

    game_id = generate_game_id()
    host_id = generate_player_id()
    joined_at = time.time()

    host_player = {
        "id": host_id,
        "name": host_name,
        "balance": INITIAL_BALANCE,
        "joined_at": joined_at,
        "wins": [],
    }

    games[game_id] = {
        "id": game_id,
        "host_id": host_id,
        "status": "lobby",
        "players": {host_id: host_player},
        "items": prepared_items,
        "current_index": 0,
        "round_phase": "lobby",
        "current_bids": {},
        "round_summary": None,
        "history": [],
        "created_at": joined_at,
    }

    return jsonify({
        "gameId": game_id,
        "player": {
            "id": host_player["id"],
            "name": host_player["name"],
            "balance": host_player["balance"],
            "isHost": True,
        },
    })





@app.post("/api/games/<game_id>/join")
def join_game(game_id):
    game, error = ensure_game(game_id)
    if error:
        return error

    if game["status"] != "lobby":
        return jsonify({"error": "Game already started"}), 400

    data = request.get_json() or {}
    player_name = (data.get("name") or "Player").strip()
    if not player_name:
        return jsonify({"error": "Player name is required"}), 400

    player_id = generate_player_id()
    now = time.time()

    game["players"][player_id] = {
        "id": player_id,
        "name": player_name,
        "balance": INITIAL_BALANCE,
        "joined_at": now,
        "wins": [],
    }

    return jsonify({
        "player": {
            "id": player_id,
            "name": player_name,
            "balance": INITIAL_BALANCE,
            "isHost": False,
        }
    })


@app.post("/api/games/<game_id>/start")
def start_game(game_id):
    game, error = ensure_game(game_id)
    if error:
        return error

    data = request.get_json() or {}
    player_id = data.get("playerId")

    if player_id != game["host_id"]:
        return jsonify({"error": "Only the host can start the game"}), 403

    if game["status"] != "lobby":
        return jsonify({"error": "Game already started"}), 400

    game["status"] = "in_progress"
    game["round_phase"] = "bidding"
    game["current_index"] = 0
    game["round_summary"] = None

    return jsonify({"status": "started"})


@app.post("/api/games/<game_id>/bid")
def submit_bid(game_id):
    game, error = ensure_game(game_id)
    if error:
        return error

    if game["status"] != "in_progress" or game["round_phase"] != "bidding":
        return jsonify({"error": "Bidding is not active"}), 400

    data = request.get_json() or {}
    player_id = data.get("playerId")
    amount = data.get("amount")

    if player_id not in game["players"]:
        return jsonify({"error": "Player not part of this game"}), 403

    try:
        bid_value = int(amount)
    except (TypeError, ValueError):
        return jsonify({"error": "Amount must be a number"}), 400

    if bid_value < 0:
        return jsonify({"error": "Bid cannot be negative"}), 400

    player = game["players"][player_id]

    if bid_value > player["balance"]:
        return jsonify({"error": "Bid exceeds available balance"}), 400

    game["current_bids"][player_id] = bid_value

    if len(game["current_bids"]) == len(game["players"]):
        resolve_round(game)

    return jsonify({"status": "accepted"})


@app.post("/api/games/<game_id>/next")
def next_round(game_id):
    game, error = ensure_game(game_id)
    if error:
        return error

    if game["status"] != "in_progress":
        return jsonify({"error": "Game is not in progress"}), 400

    if game["round_phase"] != "reveal":
        return jsonify({"error": "Round results not ready"}), 400

    data = request.get_json() or {}
    player_id = data.get("playerId")

    if player_id != game["host_id"]:
        return jsonify({"error": "Only the host can advance the game"}), 403

    if game["current_index"] + 1 >= len(game["items"]):
        game["status"] = "completed"
        game["round_phase"] = "completed"
        return jsonify({"status": "completed"})

    game["current_index"] += 1
    game["round_phase"] = "bidding"
    game["round_summary"] = None

    return jsonify({"status": "next"})


@app.get("/api/games/<game_id>")
def game_state(game_id):
    game, error = ensure_game(game_id)
    if error:
        return error

    player_id = request.args.get("playerId")
    payload = serialize_game(game, player_id)
    return jsonify(payload)


if __name__ == "__main__":
    app.run(debug=True)
