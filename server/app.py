# ==============================================================================
# FINANCE TRACKER REST API ORCHESTRATOR
# Overhauled Backend mapping note-based separate tracking tabs into discrete accounts.
# ==============================================================================

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
CORS(app)

#configure
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///data.db'
db = SQLAlchemy(app)

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


# Bootstrap the local SQLite data structure
with app.app_context():
    db.create_all()

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

    try:
        balance = float(data.get('balance', 0.0))
    except (ValueError, TypeError):
        return jsonify({'error': 'Initial balance must be a valid numeric value'}), 400

    icon = data.get('icon', '💳')

    new_acc = Account(name=name, balance=balance, icon=icon)
    db.session.add(new_acc)
    db.session.commit()

    # Log initial setup audit transaction if starting balance is non-zero
    if balance != 0:
        init_tx = Transaction(title=f"Initial setup balance", amount=balance, category=name)
        db.session.add(init_tx)
        db.session.commit()

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

    # Optionally remove associated transaction logs for cleaner ledger
    Transaction.query.filter_by(category=account.name).delete()

    db.session.delete(account)
    db.session.commit()
    return jsonify({'message': 'SUCCESS'}), 200


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

    try:
        amount = float(data['amount'])
    except (ValueError, TypeError):
        return jsonify({'error': 'Adjustment amount must be a valid number'}), 400

    note = data.get('note', '').strip()
    if not note:
        note = "Added funds" if amount >= 0 else "Spent funds"

    account.balance += amount

    # Record trace history
    tx = Transaction(title=note, amount=amount, category=account.name)
    db.session.add(tx)
    db.session.commit()

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
        'category': t.category
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

    try:
        amount = float(data['amount'])
    except (ValueError, TypeError):
        return jsonify({'error': 'Amount must be a valid number'}), 400

    title = data.get('title', '').strip()
    if not title:
        return jsonify({'error': 'Title cannot be empty'}), 400

    category = data.get('category', '').strip()
    if not category:
        category = 'General'

    # Update account balance if matching place is found
    account = Account.query.filter_by(name=category).first()
    if account:
        account.balance += amount

    new_transaction = Transaction(title=title, amount=amount, category=category)
    db.session.add(new_transaction)
    db.session.commit()
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

    # Revert account balance to stay completely synchronized
    account = Account.query.filter_by(name=transaction.category).first()
    if account:
        account.balance -= transaction.amount

    db.session.delete(transaction)
    db.session.commit()
    return jsonify({'message': 'SUCCESS'}), 200


if __name__ == '__main__':
    app.run(port=5000, debug=True)