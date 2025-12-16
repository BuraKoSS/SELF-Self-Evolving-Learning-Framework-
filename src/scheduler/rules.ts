/**
 * Scheduler Decision Rules & Rationales
 * 
 * Her scheduler kararı için "neden böyle yaptı?" sorusuna cevap veren
 * rule enum'ları ve rationale tipleri.
 */

export enum SchedulerRule {
    // Constraint-related rules
    CONSTRAINT_BLOCKED_SLOT = 'CONSTRAINT_BLOCKED_SLOT',
    CONSTRAINT_SPECIFIC_DAY = 'CONSTRAINT_SPECIFIC_DAY',
    CONSTRAINT_GENERAL_DISTRIBUTION = 'CONSTRAINT_GENERAL_DISTRIBUTION',
    
    // Goal allocation rules
    DAILY_STUDY_LIMIT_REACHED = 'DAILY_STUDY_LIMIT_REACHED',
    HIGH_PRIORITY_GOAL_ALLOCATED_EARLIER = 'HIGH_PRIORITY_GOAL_ALLOCATED_EARLIER',
    GOAL_ROUND_ROBIN_DISTRIBUTION = 'GOAL_ROUND_ROBIN_DISTRIBUTION',
    GOAL_POSTPONED_SKIPPED = 'GOAL_POSTPONED_SKIPPED',
    
    // Slot state rules
    SLOT_FREE_AVAILABLE = 'SLOT_FREE_AVAILABLE',
    SLOT_ALREADY_OCCUPIED = 'SLOT_ALREADY_OCCUPIED',
}

export interface SlotRationale {
    rule: SchedulerRule;
    message: string;
    details?: {
        constraintTitle?: string;
        goalTitle?: string;
        dayName?: string;
        hour?: number;
        priority?: 'low' | 'medium' | 'high';
        dailyLimit?: number;
        usedToday?: number;
    };
}

/**
 * Rationale mesajlarını üretir
 */
export function createRationale(rule: SchedulerRule, details?: SlotRationale['details']): SlotRationale {
    let message = '';
    
    switch (rule) {
        case SchedulerRule.CONSTRAINT_BLOCKED_SLOT:
            message = `Kısıt engellendi: ${details?.constraintTitle || 'Bilinmeyen kısıt'}`;
            break;
        case SchedulerRule.CONSTRAINT_SPECIFIC_DAY:
            message = `${details?.constraintTitle || 'Kısıt'} ${details?.dayName || ''} gününe yerleştirildi`;
            break;
        case SchedulerRule.CONSTRAINT_GENERAL_DISTRIBUTION:
            message = `${details?.constraintTitle || 'Kısıt'} haftaya dağıtıldı`;
            break;
        case SchedulerRule.DAILY_STUDY_LIMIT_REACHED:
            message = `Günlük çalışma limiti aşıldı (${details?.usedToday || 0}/${details?.dailyLimit || 0} saat)`;
            break;
        case SchedulerRule.HIGH_PRIORITY_GOAL_ALLOCATED_EARLIER:
            message = `Yüksek öncelikli hedef (${details?.goalTitle || ''}) daha erken saatlere yerleştirildi`;
            break;
        case SchedulerRule.GOAL_ROUND_ROBIN_DISTRIBUTION:
            message = `${details?.goalTitle || 'Hedef'} round-robin dağıtımı ile yerleştirildi`;
            break;
        case SchedulerRule.GOAL_POSTPONED_SKIPPED:
            message = `Ertelenen hedef atlandı: ${details?.goalTitle || ''}`;
            break;
        case SchedulerRule.SLOT_FREE_AVAILABLE:
            message = 'Boş slot mevcut';
            break;
        case SchedulerRule.SLOT_ALREADY_OCCUPIED:
            message = 'Slot zaten dolu';
            break;
        default:
            message = 'Bilinmeyen kural';
    }
    
    return {
        rule,
        message,
        details,
    };
}

