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
    
    // Block-based placement rules
    GOAL_BLOCK_PLACED_MORNING = 'GOAL_BLOCK_PLACED_MORNING',
    GOAL_BLOCK_PLACED_MIDDAY = 'GOAL_BLOCK_PLACED_MIDDAY',
    GOAL_BLOCK_PLACED_EVENING = 'GOAL_BLOCK_PLACED_EVENING',
    GOAL_BLOCK_BEST_SCORE = 'GOAL_BLOCK_BEST_SCORE',
    
    // Exam heuristic rules
    EXAM_WINDOW_ACTIVE = 'EXAM_WINDOW_ACTIVE',
    EXAM_MORNING_BOOST_APPLIED = 'EXAM_MORNING_BOOST_APPLIED',
    
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
        startMinutes?: number;
        priority?: 'low' | 'medium' | 'high';
        dailyLimit?: number;
        usedToday?: number;
        bucket?: 'morning' | 'midday' | 'evening';
        blockLength?: number;
        score?: number;
        examWindowDays?: number;
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
        case SchedulerRule.GOAL_BLOCK_PLACED_MORNING:
            message = `${details?.goalTitle || 'Hedef'} sabah bloğu olarak yerleştirildi (${details?.blockLength || 0} dk)`;
            break;
        case SchedulerRule.GOAL_BLOCK_PLACED_MIDDAY:
            message = `${details?.goalTitle || 'Hedef'} öğle bloğu olarak yerleştirildi (${details?.blockLength || 0} dk)`;
            break;
        case SchedulerRule.GOAL_BLOCK_PLACED_EVENING:
            message = `${details?.goalTitle || 'Hedef'} akşam bloğu olarak yerleştirildi (${details?.blockLength || 0} dk)`;
            break;
        case SchedulerRule.GOAL_BLOCK_BEST_SCORE:
            message = `${details?.goalTitle || 'Hedef'} en iyi skor ile yerleştirildi (skor: ${details?.score?.toFixed(2) || 'N/A'}, ${details?.bucket || ''})`;
            break;
        case SchedulerRule.EXAM_WINDOW_ACTIVE:
            message = `Sınav penceresi aktif (${details?.examWindowDays || 0} gün içinde)`;
            break;
        case SchedulerRule.EXAM_MORNING_BOOST_APPLIED:
            message = `Sınav yaklaşıyor: Sabah ağırlığı artırıldı, akşam ağırlığı azaltıldı`;
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

