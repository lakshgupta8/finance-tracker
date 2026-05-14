import {
    Landmark, Wallet, CreditCard, Shield, TrendingUp, Coins, Gem, BadgeDollarSign
} from 'lucide-react';

export const PRESET_ICONS = ['bank', 'wallet', 'card', 'shield', 'trend', 'coins', 'gem', 'dollar'];

export const getIconComponent = (iconStr: string) => {
    switch (iconStr) {
        case '🏦': case 'bank': return Landmark;
        case '💵': case 'wallet': return Wallet;
        case '💳': case 'card': return CreditCard;
        case '🛡️': case 'shield': return Shield;
        case '📈': case 'trend': return TrendingUp;
        case '🪙': case 'coins': return Coins;
        case '💎': case 'gem': return Gem;
        case '💰': case 'dollar': return BadgeDollarSign;
        default: return Wallet;
    }
};
