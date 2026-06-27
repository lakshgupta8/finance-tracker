# ==============================================================================
# FINANCE TRACKER REST API ORCHESTRATOR
# Overhauled Backend mapping note-based separate tracking tabs into discrete accounts.
# ==============================================================================

import math
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
CORS(app)

#configure
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///data.db'
db = SQLAlchemy(app)

def is_finite_number(value):
    try:
        val = float(value)
        return math.isfinite(val)
    except (ValueError, TypeError):
        return False


# ------------------------------------------------------------------------------
# DATABASE MODELS
# ------------------------------------------------------------------------------

class Account(db.Model):
    """
    Represents a distinct physical or digital place where money is kept.
    Allows users to maintain isolated tracking tabs and add/subtract dynamically.
    """
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    balance = db.Column(db.Float, nullable=False, default=0.0)
    icon = db.Column(db.String(20), default='💳')


class Transaction(db.Model):
    """
    Serves as an immutable audit trace ledger documenting adjustments.
    The `category` field cleanly maps to the corresponding Account tab name.
    """
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(50))  # Stores Account Name
    date_added = db.Column(db.String(50), nullable=False, server_default='not timed', default=lambda: datetime.now().strftime('%d %b %Y, %I:%M %p'))


# Bootstrap the local SQLite data structure
with app.app_context():
    db.create_all()
    # Resilient schema check to automatically add date_added if it is missing
    try:
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        columns = [col['name'] for col in inspector.get_columns('transaction')]
        if 'date_added' not in columns:
            with db.engine.connect() as conn:
                conn.execute(db.text('ALTER TABLE "transaction" ADD COLUMN date_added VARCHAR(50) DEFAULT \'not timed\''))
                conn.commit()
    except Exception as e:
        app.logger.error(f"Migration error: {e}")

# ------------------------------------------------------------------------------
# ACCOUNT / PLACE MANAGEMENT ROUTES
# ------------------------------------------------------------------------------

@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    """
    Retrieves all separate tracking places configured by the user.
    """
    accounts = Account.query.all()

    return jsonify([{
        'id': a.id,
        'name': a.name,
        'balance': a.balance,
        'icon': a.icon
    } for a in accounts])


@app.route('/api/accounts', methods=['POST'])
def add_account():
    """
    Initializes a new tracking tab. Enforces strict input schema validations
    ensuring name uniqueness and valid floating-point numeric starting balances.
    """
    data = request.json
    if not data:
        return jsonify({'error': 'Invalid payload'}), 400

    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Place/Account name cannot be empty'}), 400

    existing = Account.query.filter_by(name=name).first()
    if existing:
        return jsonify({'error': 'A place of money with this name already exists'}), 400

    balance_val = data.get('balance', 0.0)
    if not is_finite_number(balance_val):
        return jsonify({'error': 'Initial balance must be a valid finite numeric value'}), 400
    balance = float(balance_val)

    icon = data.get('icon', '💳')

    try:
        new_acc = Account(name=name, balance=balance, icon=icon)
        db.session.add(new_acc)
        # Log initial setup audit transaction if starting balance is non-zero
        if balance != 0:
            init_tx = Transaction(title=f"Initial setup balance", amount=balance, category=name)
            db.session.add(init_tx)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Database error occurred: {str(e)}'}), 500

    return jsonify({
        'id': new_acc.id,
        'name': new_acc.name,
        'balance': new_acc.balance,
        'icon': new_acc.icon
    }), 201


@app.route('/api/accounts/<int:id>', methods=['DELETE'])
def delete_account(id):
    """
    Permanently erases a tracking place along with its historic ledger rows.
    """
    account = db.session.get(Account, id)
    if not account:
        return jsonify({'error': 'Account/Place not found'}), 404

    try:
        # Optionally remove associated transaction logs for cleaner ledger
        Transaction.query.filter_by(category=account.name).delete()
        db.session.delete(account)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Database error occurred: {str(e)}'}), 500
    return jsonify({'message': 'SUCCESS'}), 200


@app.route('/api/accounts/<int:id>', methods=['PUT'])
def update_account(id):
    """
    Updates an account's name and icon. Automatically cascades the name change
    to the ledger's transactions to maintain perfect history consistency.
    """
    account = db.session.get(Account, id)
    if not account:
        return jsonify({'error': 'Account/Place not found'}), 404

    data = request.json
    if not data:
        return jsonify({'error': 'Invalid payload'}), 400

    new_name = data.get('name', '').strip()
    if not new_name:
        return jsonify({'error': 'Place/Account name cannot be empty'}), 400

    new_icon = data.get('icon', '💳')

    if new_name != account.name:
        existing = Account.query.filter_by(name=new_name).first()
        if existing:
            return jsonify({'error': 'A place of money with this name already exists'}), 400

    old_name = account.name

    try:
        account.name = new_name
        account.icon = new_icon

        # Update historical ledger entries to keep transaction consistency
        transactions = Transaction.query.filter_by(category=old_name).all()
        for tx in transactions:
            tx.category = new_name

        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Database error occurred: {str(e)}'}), 500

    return jsonify({
        'id': account.id,
        'name': account.name,
        'balance': account.balance,
        'icon': account.icon
    }), 200


@app.route('/api/accounts/<int:id>/adjust', methods=['POST'])
def adjust_account(id):
    """
    Core workflow trigger: Allows continuous inline +/- modifications to a specific
    place tab as money is gained or spent. Updates persistent store and leaves an audit trail.
    """
    account = db.session.get(Account, id)
    if not account:
        return jsonify({'error': 'Account/Place not found'}), 404

    data = request.json
    if not data:
        return jsonify({'error': 'Invalid payload'}), 400

    if 'amount' not in data or data['amount'] is None or data['amount'] == '':
        return jsonify({'error': 'Amount cannot be empty'}), 400

    amount_val = data['amount']
    if not is_finite_number(amount_val):
        return jsonify({'error': 'Adjustment amount must be a valid finite number'}), 400

    amount = float(amount_val)
    note = data.get('note', '').strip()
    if not note:
        note = "Added funds" if amount >= 0 else "Spent funds"

    try:
        account.balance += amount
        # Record trace history
        tx = Transaction(title=note, amount=amount, category=account.name)
        db.session.add(tx)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Database error occurred: {str(e)}'}), 500

    return jsonify({
        'id': account.id,
        'name': account.name,
        'balance': account.balance,
        'icon': account.icon
    }), 200


# ------------------------------------------------------------------------------
# TRANSACTION / LEDGER TRACE LOG ROUTES
# ------------------------------------------------------------------------------

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    """
    Outputs chronologically descending trace history for review.
    """
    transactions = Transaction.query.order_by(Transaction.id.desc()).all()
    return jsonify([{
        'id': t.id, 
        'title': t.title, 
        'amount': t.amount, 
        'category': t.category,
        'date_added': t.date_added
    } for t in transactions])


@app.route('/api/transactions', methods=['POST'])
def add_transaction():
    """
    Fallback interface endpoint matching classic transaction injection patterns.
    Automatically increments/decrements associated tracking tabs internally.
    """
    data = request.json
    if not data:
        return jsonify({'error': 'Invalid payload'}), 400

    if 'amount' not in data or data['amount'] is None or data['amount'] == '':
        return jsonify({'error': 'Amount cannot be empty'}), 400

    amount_val = data['amount']
    if not is_finite_number(amount_val):
        return jsonify({'error': 'Amount must be a valid finite number'}), 400

    amount = float(amount_val)
    title = data.get('title', '').strip()
    if not title:
        return jsonify({'error': 'Title cannot be empty'}), 400

    category = data.get('category', '').strip()
    if not category:
        category = 'General'

    try:
        # Update account balance if matching place is found
        account = Account.query.filter_by(name=category).first()
        if account:
            account.balance += amount

        new_transaction = Transaction(title=title, amount=amount, category=category)
        db.session.add(new_transaction)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Database error occurred: {str(e)}'}), 500

    return jsonify({'message': 'SUCCESS'}), 201


@app.route('/api/transactions/<int:id>', methods=['DELETE'])
def delete_transaction(id):
    """
    Removes a trace entry while intelligently applying inverted adjustments
    to the target account to maintain perfect ledger arithmetic.
    """
    transaction = db.session.get(Transaction, id)
    if not transaction:
        return jsonify({'error': 'Transaction not found'}), 404

    try:
        # Revert account balance to stay completely synchronized
        account = Account.query.filter_by(name=transaction.category).first()
        if account:
            account.balance -= transaction.amount

        db.session.delete(transaction)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Database error occurred: {str(e)}'}), 500

    return jsonify({'message': 'SUCCESS'}), 200


if __name__ == '__main__':
    app.run(port=5000, debug=True)