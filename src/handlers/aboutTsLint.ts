export interface RuleFailure {
    endPosition: { character: number, line: number };
    startPosition: { character: number, line: number };
    failure: string;
    name: string;
    ruleName: string;
    ruleSeverity: string;
}


export interface Location {
    readonly path: string;
    readonly lineFrom1: number;
    readonly columnFrom1: number;
    readonly description: string;
}


export interface WhereToFix {
    repo: { owner: string, name: string };
    branch: string;
}
