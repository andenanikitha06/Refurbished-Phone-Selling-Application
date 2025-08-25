from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, session
import sqlite3
import csv
import io
import json
from datetime import datetime
from werkzeug.utils import secure_filename
import os
import pandas as pd

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'
app.config['UPLOAD_FOLDER'] = 'uploads'

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Platform configurations
PLATFORMS = {
    'X': {
        'name': 'Platform X',
        'fee_type': 'percentage',
        'fee': 0.10,
        'conditions': ['New', 'Good', 'Scrap']
    },
    'Y': {
        'name': 'Platform Y',
        'fee_type': 'percentage_plus_fixed',
        'fee': 0.08,
        'fixed_fee': 2.0,
        'conditions': ['3 stars (Excellent)', '2 stars (Good)', '1 star (Usable)']
    },
    'Z': {
        'name': 'Platform Z',
        'fee_type': 'percentage',
        'fee': 0.12,
        'conditions': ['New', 'As New', 'Good']
    }
}

# Condition mapping
CONDITION_MAPPING = {
    'New': {
        'X': 'New',
        'Y': '3 stars (Excellent)',
        'Z': 'New'
    },
    'Excellent': {
        'X': 'Good',
        'Y': '3 stars (Excellent)',
        'Z': 'As New'
    },
    'Good': {
        'X': 'Good',
        'Y': '2 stars (Good)',
        'Z': 'Good'
    },
    'Fair': {
        'X': 'Good',
        'Y': '1 star (Usable)',
        'Z': 'Good'
    },
    'Poor': {
        'X': 'Scrap',
        'Y': '1 star (Usable)',
        'Z': None  # Can't list on Z
    }
}

def init_db():
    """Initialize the database with required tables"""
    conn = sqlite3.connect('phones.db')
    c = conn.cursor()
    
    # Create phones table
    c.execute('''
        CREATE TABLE IF NOT EXISTS phones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_name TEXT NOT NULL,
            brand TEXT NOT NULL,
            condition TEXT NOT NULL,
            storage TEXT,
            color TEXT,
            stock_quantity INTEGER DEFAULT 0,
            base_price REAL NOT NULL,
            specifications TEXT,
            tags TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create platform_listings table
    c.execute('''
        CREATE TABLE IF NOT EXISTS platform_listings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone_id INTEGER,
            platform TEXT NOT NULL,
            listed BOOLEAN DEFAULT 0,
            platform_price REAL,
            platform_condition TEXT,
            listing_date TIMESTAMP,
            FOREIGN KEY (phone_id) REFERENCES phones (id)
        )
    ''')
    
    # Create users table for authentication
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'admin'
        )
    ''')
    
    # Insert default admin user
    c.execute('''
        INSERT OR IGNORE INTO users (username, password, role) 
        VALUES ('admin', 'password123', 'admin')
    ''')
    
    conn.commit()
    conn.close()

def calculate_platform_price(base_price, platform):
    """Calculate platform-specific price based on fees"""
    platform_config = PLATFORMS[platform]
    
    if platform_config['fee_type'] == 'percentage':
        fee = base_price * platform_config['fee']
        final_price = base_price + fee
    elif platform_config['fee_type'] == 'percentage_plus_fixed':
        percentage_fee = base_price * platform_config['fee']
        final_price = base_price + percentage_fee + platform_config['fixed_fee']
    
    return round(final_price, 2)

def is_profitable(base_price, platform, min_profit_margin=0.1):
    """Check if listing on platform would be profitable"""
    platform_price = calculate_platform_price(base_price, platform)
    profit = platform_price - base_price
    profit_margin = profit / base_price if base_price > 0 else 0
    return profit_margin >= min_profit_margin

@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        conn = sqlite3.connect('phones.db')
        c = conn.cursor()
        c.execute('SELECT id, username FROM users WHERE username = ? AND password = ?', 
                 (username, password))
        user = c.fetchone()
        conn.close()
        
        if user:
            session['user_id'] = user[0]
            session['username'] = user[1]
            flash('Login successful!', 'success')
            return redirect(url_for('index'))
        else:
            flash('Invalid credentials!', 'error')
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/inventory')
def inventory():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('inventory.html')

@app.route('/platforms')
def platforms():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('platforms.html')

@app.route('/api/phones', methods=['GET'])
def get_phones():
    search = request.args.get('search', '')
    condition_filter = request.args.get('condition', '')
    platform_filter = request.args.get('platform', '')
    
    conn = sqlite3.connect('phones.db')
    c = conn.cursor()
    
    query = '''
        SELECT p.*, 
               GROUP_CONCAT(pl.platform || ':' || pl.listed) as platform_info
        FROM phones p 
        LEFT JOIN platform_listings pl ON p.id = pl.phone_id 
        WHERE 1=1
    '''
    params = []
    
    if search:
        query += ' AND (p.model_name LIKE ? OR p.brand LIKE ?)'
        params.extend([f'%{search}%', f'%{search}%'])
    
    if condition_filter:
        query += ' AND p.condition = ?'
        params.append(condition_filter)
    
    query += ' GROUP BY p.id ORDER BY p.created_at DESC'
    
    c.execute(query, params)
    phones = c.fetchall()
    conn.close()
    
    result = []
    for phone in phones:
        phone_dict = {
            'id': phone[0],
            'model_name': phone[1],
            'brand': phone[2],
            'condition': phone[3],
            'storage': phone[4],
            'color': phone[5],
            'stock_quantity': phone[6],
            'base_price': phone[7],
            'specifications': phone[8],
            'tags': phone[9],
            'created_at': phone[10],
            'platforms': {}
        }
        
        # Parse platform info
        if phone[11]:
            for platform_info in phone[11].split(','):
                platform, listed = platform_info.split(':')
                phone_dict['platforms'][platform] = bool(int(listed))
        
        result.append(phone_dict)
    
    return jsonify(result)

@app.route('/api/phones', methods=['POST'])
def add_phone():
    data = request.json
    
    # Validate required fields
    required_fields = ['model_name', 'brand', 'condition', 'base_price']
    for field in required_fields:
        if field not in data or not data[field]:
            return jsonify({'error': f'{field} is required'}), 400
    
    try:
        conn = sqlite3.connect('phones.db')
        c = conn.cursor()
        
        c.execute('''
            INSERT INTO phones (model_name, brand, condition, storage, color, 
                              stock_quantity, base_price, specifications, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data['model_name'],
            data['brand'],
            data['condition'],
            data.get('storage', ''),
            data.get('color', ''),
            data.get('stock_quantity', 0),
            float(data['base_price']),
            data.get('specifications', ''),
            data.get('tags', '')
        ))
        
        phone_id = c.lastrowid
        
        # Create platform listing entries
        for platform in PLATFORMS.keys():
            c.execute('''
                INSERT INTO platform_listings (phone_id, platform, listed, platform_price, platform_condition)
                VALUES (?, ?, 0, ?, ?)
            ''', (
                phone_id,
                platform,
                calculate_platform_price(float(data['base_price']), platform),
                CONDITION_MAPPING.get(data['condition'], {}).get(platform)
            ))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'id': phone_id})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/phones/<int:phone_id>', methods=['PUT'])
def update_phone(phone_id):
    data = request.json
    
    try:
        conn = sqlite3.connect('phones.db')
        c = conn.cursor()
        
        c.execute('''
            UPDATE phones 
            SET model_name = ?, brand = ?, condition = ?, storage = ?, color = ?,
                stock_quantity = ?, base_price = ?, specifications = ?, tags = ?
            WHERE id = ?
        ''', (
            data['model_name'],
            data['brand'],
            data['condition'],
            data.get('storage', ''),
            data.get('color', ''),
            data.get('stock_quantity', 0),
            float(data['base_price']),
            data.get('specifications', ''),
            data.get('tags', ''),
            phone_id
        ))
        
        # Update platform prices
        for platform in PLATFORMS.keys():
            c.execute('''
                UPDATE platform_listings 
                SET platform_price = ?, platform_condition = ?
                WHERE phone_id = ? AND platform = ?
            ''', (
                calculate_platform_price(float(data['base_price']), platform),
                CONDITION_MAPPING.get(data['condition'], {}).get(platform),
                phone_id,
                platform
            ))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/phones/<int:phone_id>', methods=['DELETE'])
def delete_phone(phone_id):
    try:
        conn = sqlite3.connect('phones.db')
        c = conn.cursor()
        
        c.execute('DELETE FROM platform_listings WHERE phone_id = ?', (phone_id,))
        c.execute('DELETE FROM phones WHERE id = ?', (phone_id,))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Fixed bulk upload endpoint
# Fixed bulk upload endpoint with better error handling
@app.route("/api/bulk-upload", methods=["POST"])
def bulk_upload():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files["file"]
    
    # Check if file was actually selected
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    # Check file extension
    if not file.filename.lower().endswith('.csv'):
        return jsonify({"error": "Please upload a CSV file"}), 400

    try:
        # Read the CSV file - try different encodings
        try:
            # Read file content into memory first
            file_content = file.read()
            
            # Try UTF-8 first
            csv_string = file_content.decode('utf-8')
        except UnicodeDecodeError:
            try:
                # Try latin-1 encoding
                csv_string = file_content.decode('latin-1')
            except UnicodeDecodeError:
                # Try cp1252 (Windows encoding)
                csv_string = file_content.decode('cp1252')
        
        # Use StringIO to create file-like object for pandas
        from io import StringIO
        csv_file = StringIO(csv_string)
        
        # Read CSV with pandas
        df = pd.read_csv(csv_file)
        
        # Clean column names - remove whitespace
        df.columns = df.columns.str.strip()
        
        # Validate required columns
        required_columns = ['model_name', 'brand', 'condition', 'base_price']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            return jsonify({
                "error": f"Missing required columns: {', '.join(missing_columns)}. "
                        f"Found columns: {', '.join(df.columns.tolist())}"
            }), 400
        
        # Remove completely empty rows
        df = df.dropna(how='all')
        
        if df.empty:
            return jsonify({"error": "CSV file is empty or contains no valid data"}), 400
        
    except Exception as e:
        return jsonify({"error": f"Failed to parse CSV file: {str(e)}"}), 500

    # Insert into database
    conn = sqlite3.connect("phones.db")
    c = conn.cursor()

    success_count, error_count = 0, 0
    errors = []

    for index, row in df.iterrows():
        row_num = index + 2  # +2 because pandas is 0-indexed and we skip header
        try:
            # Validate required fields
            model_name = str(row.get("model_name", "")).strip()
            brand = str(row.get("brand", "")).strip()
            condition = str(row.get("condition", "")).strip()
            base_price = row.get("base_price")
            
            # Check for missing required fields
            if not model_name or not brand or not condition:
                error_count += 1
                errors.append(f"Row {row_num}: Missing required fields (model_name, brand, or condition)")
                continue
            
            # Validate and convert base_price
            try:
                base_price = float(base_price)
                if base_price <= 0:
                    raise ValueError("Price must be positive")
            except (ValueError, TypeError):
                error_count += 1
                errors.append(f"Row {row_num}: Invalid base_price '{base_price}' - must be a positive number")
                continue
            
            # Validate condition
            valid_conditions = ['New', 'Excellent', 'Good', 'Fair', 'Poor']
            if condition not in valid_conditions:
                error_count += 1
                errors.append(f"Row {row_num}: Invalid condition '{condition}' - must be one of: {', '.join(valid_conditions)}")
                continue
            
            # Get optional fields with defaults
            storage = str(row.get("storage", "")).strip() if pd.notna(row.get("storage")) else ""
            color = str(row.get("color", "")).strip() if pd.notna(row.get("color")) else ""
            specifications = str(row.get("specifications", "")).strip() if pd.notna(row.get("specifications")) else ""
            tags = str(row.get("tags", "")).strip() if pd.notna(row.get("tags")) else ""
            
            # Handle stock_quantity
            try:
                stock_quantity = int(row.get("stock_quantity", 0) or 0)
                if stock_quantity < 0:
                    stock_quantity = 0
            except (ValueError, TypeError):
                stock_quantity = 0

            # Insert phone record
            c.execute("""
                INSERT INTO phones (model_name, brand, condition, storage, color,
                                    stock_quantity, base_price, specifications, tags)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                model_name,
                brand,
                condition,
                storage,
                color,
                stock_quantity,
                base_price,
                specifications,
                tags
            ))

            phone_id = c.lastrowid

            # Create platform listings for each platform
            for platform in PLATFORMS.keys():
                platform_price = calculate_platform_price(base_price, platform)
                platform_condition = CONDITION_MAPPING.get(condition, {}).get(platform)
                
                c.execute("""
                    INSERT INTO platform_listings 
                    (phone_id, platform, listed, platform_price, platform_condition)
                    VALUES (?, ?, 0, ?, ?)
                """, (
                    phone_id,
                    platform,
                    platform_price,
                    platform_condition
                ))

            success_count += 1

        except Exception as e:
            error_count += 1
            errors.append(f"Row {row_num}: {str(e)}")
            print(f"Error processing row {row_num}: {e}")  # For debugging

    try:
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    finally:
        conn.close()

    # Prepare response message
    if success_count == 0:
        return jsonify({
            "error": "No phones were uploaded successfully",
            "errors": errors[:10]  # Show first 10 errors
        }), 400
    
    msg = f"Successfully uploaded {success_count} phones"
    if error_count > 0:
        msg += f" ({error_count} rows had errors)"

    return jsonify({
        "success": True,
        "message": msg,
        "success_count": success_count,
        "error_count": error_count,
        "errors": errors[:10] if errors else []  # Show first 10 errors
    }), 200
    
@app.route('/api/platform-summary')
def platform_summary():
    conn = sqlite3.connect('phones.db')
    c = conn.cursor()
    
    summary = {}
    for platform in PLATFORMS.keys():
        c.execute('''
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN pl.listed = 1 THEN 1 ELSE 0 END) as listed,
                   AVG(CASE WHEN pl.listed = 1 THEN pl.platform_price ELSE NULL END) as avg_price
            FROM platform_listings pl
            JOIN phones p ON pl.phone_id = p.id
            WHERE pl.platform = ?
        ''', (platform,))
        
        result = c.fetchone()
        summary[platform] = {
            'name': PLATFORMS[platform]['name'],
            'total_phones': result[0] or 0,
            'listed_phones': result[1] or 0,
            'avg_price': round(result[2] or 0, 2),
            'fee_structure': f"{PLATFORMS[platform]['fee']*100}%" + 
                           (f" + ${PLATFORMS[platform].get('fixed_fee', 0)}" if 'fixed_fee' in PLATFORMS[platform] else "")
        }
    
    conn.close()
    return jsonify(summary)

# New endpoints for platform management
@app.route('/api/platforms/<platform>/bulk-list', methods=['POST'])
def bulk_list_platform(platform):
    if platform not in PLATFORMS:
        return jsonify({'error': 'Invalid platform'}), 400
    
    try:
        conn = sqlite3.connect('phones.db')
        c = conn.cursor()
        
        # Get all phones that can be listed on this platform
        c.execute('''
            SELECT p.id, p.base_price, p.condition, p.stock_quantity
            FROM phones p
            JOIN platform_listings pl ON p.id = pl.phone_id
            WHERE pl.platform = ? AND pl.listed = 0 AND p.stock_quantity > 0
        ''', (platform,))
        
        phones = c.fetchall()
        listed_count = 0
        
        for phone in phones:
            phone_id, base_price, condition, stock = phone
            
            # Check if condition is supported and profitable
            platform_condition = CONDITION_MAPPING.get(condition, {}).get(platform)
            if platform_condition and is_profitable(base_price, platform):
                # Simulate listing (75% success rate)
                import random
                if random.choice([True, True, True, False]):
                    c.execute('''
                        UPDATE platform_listings 
                        SET listed = 1, listing_date = ?
                        WHERE phone_id = ? AND platform = ?
                    ''', (datetime.now(), phone_id, platform))
                    listed_count += 1
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'message': f'Successfully listed {listed_count} phones on {PLATFORMS[platform]["name"]}'
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/platforms/<platform>/update-prices', methods=['POST'])
def update_platform_prices(platform):
    if platform not in PLATFORMS:
        return jsonify({'error': 'Invalid platform'}), 400
    
    try:
        conn = sqlite3.connect('phones.db')
        c = conn.cursor()
        
        # Get all phones for this platform
        c.execute('''
            SELECT p.id, p.base_price
            FROM phones p
            JOIN platform_listings pl ON p.id = pl.phone_id
            WHERE pl.platform = ?
        ''', (platform,))
        
        phones = c.fetchall()
        updated_count = 0
        
        for phone in phones:
            phone_id, base_price = phone
            new_price = calculate_platform_price(base_price, platform)
            
            c.execute('''
                UPDATE platform_listings 
                SET platform_price = ?
                WHERE phone_id = ? AND platform = ?
            ''', (new_price, phone_id, platform))
            updated_count += 1
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'message': f'Updated prices for {updated_count} phones on {PLATFORMS[platform]["name"]}'
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/analysis/profitability')
def profitability_analysis():
    try:
        conn = sqlite3.connect('phones.db')
        c = conn.cursor()
        
        # Get all phones with their platform data
        c.execute('''
            SELECT p.id, p.model_name, p.brand, p.base_price, p.condition,
                   pl.platform, pl.platform_price, pl.listed
            FROM phones p
            JOIN platform_listings pl ON p.id = pl.phone_id
            ORDER BY p.model_name
        ''')
        
        results = c.fetchall()
        conn.close()
        
        # Process data for analysis
        analysis_data = {}
        for row in results:
            phone_id = row[0]
            if phone_id not in analysis_data:
                analysis_data[phone_id] = {
                    'id': phone_id,
                    'model_name': row[1],
                    'brand': row[2],
                    'base_price': row[3],
                    'condition': row[4],
                    'platforms': {}
                }
            
            platform = row[5]
            platform_price = row[6]
            listed = bool(row[7])
            
            profit = platform_price - row[3]
            profit_margin = (profit / row[3]) * 100 if row[3] > 0 else 0
            
            analysis_data[phone_id]['platforms'][platform] = {
                'price': platform_price,
                'profit': profit,
                'profit_margin': profit_margin,
                'listed': listed,
                'profitable': profit_margin >= 10  # 10% minimum margin
            }
        
        return jsonify(list(analysis_data.values()))
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    init_db()
    app.run(debug=True)