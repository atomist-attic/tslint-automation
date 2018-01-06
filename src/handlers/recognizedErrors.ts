
import { RuleFailure, WhereToFix, Location } from "./aboutTsLint";
import { buttonForCommand } from "@atomist/automation-client/spi/message/MessageClient";
import { Action } from "@atomist/slack-messages/SlackMessages";

export function recognizeError(tsError: RuleFailure): RecognizedError {
    return CommentFormatError.recognize(tsError) || new RecognizedError(tsError);
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
                text: "Proposed fix: `" + singleLineCommentFix + "`",
                actions: [buttonForCommand({ text: "Fix it" },
                    "ReplaceLine", {
                        "targets.owner": details.repo.owner,
                        "targets.repo": details.repo.name,
                        "targets.branch": details.branch,
                        previousContent,
                        "insert": singleLineCommentFix,
                        "lineFrom1": location.lineFrom1,
                        "message": "lint: comment format",
                        "path": location.path,
                    })],
            };
        } else {
            return super.fix(details, location, previousContent);
        }
    }

}