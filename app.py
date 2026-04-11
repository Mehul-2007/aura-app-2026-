import os
import json
from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

LOG_FILE = 'logs.json'
USERS_FILE = 'users.json'
HELP_FILE = 'help_requests.json'

# Ensure files exist for production stability
for f in [LOG_FILE, USERS_FILE, HELP_FILE]:
    if not os.path.exists(f):
        with open(f, 'w') as file:
            json.dump([], file)

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/owner')
def owner():
    return send_from_directory('.', 'owner.html')

@app.route('/api/log', methods=['POST'])
def log_hazard():
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    logs = []
    if os.path.exists(LOG_FILE):
        try:
            with open(LOG_FILE, 'r') as f:
                logs = json.load(f)
        except Exception:
            logs = []
            
    logs.append(data)
    
    with open(LOG_FILE, 'w') as f:
        json.dump(logs, f, indent=4)
        
    return jsonify({"status": "success"}), 201

@app.route('/api/stats', methods=['GET'])
def get_stats():
    if os.path.exists(LOG_FILE):
        try:
            with open(LOG_FILE, 'r') as f:
                logs = json.load(f)
            return jsonify({"total_hazards": len(logs), "logs": logs})
        except Exception:
            return jsonify({"total_hazards": 0, "logs": []})
    return jsonify({"total_hazards": 0, "logs": []})

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json
    if not data or not data.get('phone') or not data.get('password'):
        return jsonify({"error": "Phone and Password are required"}), 400
    
    users = []
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, 'r') as f:
                users = json.load(f)
        except Exception:
            users = []
            
    # Check if user already exists
    for u in users:
        if u.get('phone') == data.get('phone'):
            return jsonify({"error": "User with this phone number already exists"}), 409
            
    # Create new user
    user_entry = {
        "name": data.get('name', 'Anonymous'),
        "phone": data.get('phone'),
        "password": data.get('password'), # In production, this should be hashed
        "timestamp": data.get('timestamp')
    }
    users.append(user_entry)
    
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f, indent=4)
        
    return jsonify({"status": "success", "user": {"name": user_entry['name'], "phone": user_entry['phone']}}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    if not data or not data.get('phone') or not data.get('password'):
        return jsonify({"error": "Phone and Password are required"}), 400
        
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, 'r') as f:
                users = json.load(f)
                
            for u in users:
                if u.get('phone') == data.get('phone') and u.get('password') == data.get('password'):
                    return jsonify({
                        "status": "success", 
                        "user": {"name": u['name'], "phone": u['phone']}
                    }), 200
                    
            return jsonify({"error": "Invalid phone number or password"}), 401
        except Exception as e:
            return jsonify({"error": "Server error during login"}), 500
            
    return jsonify({"error": "No users registered yet"}), 404

@app.route('/api/users', methods=['GET'])
def get_users():
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, 'r') as f:
                users = json.load(f)
            return jsonify(users)
        except Exception:
            return jsonify([])
    return jsonify([])

@app.route('/api/help', methods=['POST'])
def help_request():
    data = request.json
    if not data: return jsonify({"error": "No data"}), 400
    
    requests = []
    if os.path.exists(HELP_FILE):
        try:
            with open(HELP_FILE, 'r') as f: requests = json.load(f)
        except Exception: requests = []
            
    requests.append(data)
    with open(HELP_FILE, 'w') as f: json.dump(requests, f, indent=4)
    return jsonify({"status": "success"}), 201

@app.route('/api/help', methods=['GET'])
def get_help():
    if os.path.exists(HELP_FILE):
        try:
            with open(HELP_FILE, 'r') as f: return jsonify(json.load(f))
        except Exception: return jsonify([])
    return jsonify([])

if __name__ == '__main__':
    # Get port from environment variable for cloud deployment (e.g., Render/Heroku)
    # Default to 8000 for local testing
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting Aura Python Backend on port {port}")
    # Set debug=False for production security
    app.run(host='0.0.0.0', port=port, debug=False)
