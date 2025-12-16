
export type IssueType =
    | 'CONFLICT'
    | 'OVERLOAD'
    | 'EXAM_PROXIMITY'
    | 'MISSED_DEADLINE'
    | 'POLICY_VIOLATION';

export type IssueSeverity = 'info' | 'warning' | 'critical';

export interface GuardianIssue {
    type: IssueType;
    severity: IssueSeverity;
    message: string;
    relatedGoalId?: number;
    relatedDate?: string; // YYYY-MM-DD or DayName
    suggestedFix?: {
        action: 'move' | 'reduce' | 'split' | 'ignore';
        description: string;
    };
}
