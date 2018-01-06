import { RuleFailure, WhereToFix, Location } from "./aboutTsLint";
import { buttonForCommand } from "@atomist/automation-client/spi/message/MessageClient";
import { Action } from "@atomist/slack-messages/SlackMessages";

export function recognizeError(tsError: RuleFailure): RecognizedError {
    return CommentFormatError.recognize(tsError) ||
        TripleEqualsError.recognize(tsError) ||
        new RecognizedError(tsError);
}


export interface FixInfo {
    text: string;
    actions: Action[];
}


export class RecognizedError {

    private static defaultOptions = {
        color: "#888888",
        usefulToShowLine: true,
    };

    public color: string;
    public usefulToShowLine: boolean;

    constructor(private ruleFailure: RuleFailure,
                opts?: { color?: string, usefulToShowLine?: boolean }) {
        const fullOpts = {
            ...RecognizedError.defaultOptions,
            ...opts,
        };
        this.color = fullOpts.color;
        this.usefulToShowLine = fullOpts.usefulToShowLine;
    }

    get name(): string {
        return this.ruleFailure.ruleName;
    }

    get description(): string {
        return this.ruleFailure.failure;
    }

    public fix(details: WhereToFix, location: Location, previousContent: string): FixInfo {
        return { text: "", actions: [] };
    }

}


class CommentFormatError extends RecognizedError {

    public static Name = "comment-format";

    public static recognize(tsError: RuleFailure): CommentFormatError | null {
        if (tsError.ruleName === this.Name) {
            return new CommentFormatError(tsError);
        }
        return null;
    }

    constructor(tsError: RuleFailure) {
        super(tsError,
            { color: "#6020a0", usefulToShowLine: true });
    }

    // yeah ok I wish I had both previousContent and Location in the constructor instead
    public fix(details: WhereToFix, location: Location, previousContent: string): FixInfo {
        const singleLineCommentFix = previousContent.replace(/\/\/(\S)/, "// $1");
        if (singleLineCommentFix !== previousContent) {
            return {
                text: "Proposed fix: `" + singleLineCommentFix.trim() + "`",
                actions: [replaceButton({
                    details, location, previousContent,
                    newContent: singleLineCommentFix, message: "lint fix: single line comment",
                })],
            };
        } else {
            return super.fix(details, location, previousContent);
        }
    }
}

function replaceButton(specs: { details: WhereToFix, location: Location, previousContent: string, newContent: string, message: string }): Action {
    return buttonForCommand({ text: "Fix it" },
        "ReplaceLine", {
            "targets.owner": specs.details.repo.owner,
            "targets.repo": specs.details.repo.name,
            "targets.branch": specs.details.branch,
            previousContent: specs.previousContent,
            "insert": specs.newContent,
            "lineFrom1": specs.location.lineFrom1,
            "message": specs.message,
            "path": specs.location.path,
        });
}

function deleteLineButton(specs: { details: WhereToFix, location: Location, previousContent: string, message: string }): Action {
    return buttonForCommand({ text: "Fix it" },
        "ReplaceLine", {
            "targets.owner": specs.details.repo.owner,
            "targets.repo": specs.details.repo.name,
            "targets.branch": specs.details.branch,
            previousContent: specs.previousContent,
            "lineFrom1": specs.location.lineFrom1,
            "message": specs.message,
            "path": specs.location.path,
        });
}

class TripleEqualsError extends RecognizedError {
    public static Name = "triple-equals";

    public static recognize(tsError: RuleFailure): TripleEqualsError | null {
        if (tsError.ruleName === this.Name) {
            return new TripleEqualsError(tsError);
        }
        return null;
    }

    constructor(tsError: RuleFailure) {
        super(tsError,
            { color: "#2040a0" });
    }

    public fix(details: WhereToFix, location: Location, previousContent: string): FixInfo {
        const easyFix = previousContent
            .replace(/!=([^=])/g, "!==$1")
            .replace(/([^!=])==([^=])/g, "$1===$2");
        if (easyFix !== previousContent) {
            return {
                text: "Proposed fix: `" + easyFix.trim() + "`",
                actions: [replaceButton({
                    details, location, previousContent,
                    newContent: easyFix, message: "lint fix: triple equals",
                })],
            };
        } else {
            return super.fix(details, location, previousContent);
        }
    }
}

class ConsoleLogError extends RecognizedError {
    public static Name = "no-console";

    public static recognize(tsError: RuleFailure): ConsoleLogError | null {
        if (tsError.ruleName === this.Name) {
            return new ConsoleLogError(tsError);
        }
        return null;
    }

    constructor(tsError: RuleFailure) {
        super(tsError,
            { color: "#f06000" });
    }

    public fix(details: WhereToFix, location: Location, previousContent: string): FixInfo {
        if (previousContent.endsWith(";")) {
            return {
                text: "Proposed fix: delete the line, or replace with a log statement",
                actions: [deleteLineButton({
                    details, location, previousContent,
                    message: "lint fix: remove console.log",
                })],
            };
        } else {
            return super.fix(details, location, previousContent);
        }
    }

}
