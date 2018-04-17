/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { buttonForCommand } from "@atomist/automation-client/spi/message/MessageClient";
import { Action } from "@atomist/slack-messages/SlackMessages";
import { Location, RuleFailure, WhereToFix } from "./aboutTsLint";
import { ReplaceConsoleLogWithLogger } from "./specializedEditor";

export function recognizeError(tsError: RuleFailure): RecognizedError {
    return CommentFormatError.recognize(tsError) ||
        TripleEqualsError.recognize(tsError) ||
        ConsoleLogError.recognize(tsError) ||
        ConstructorParentheses.recognize(tsError) ||
        BanStringType.recognize(tsError) ||
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
            "previousContent": specs.previousContent,
            "insert": specs.newContent,
            "lineFrom1": specs.location.lineFrom1,
            "message": specs.message,
            "path": specs.location.path,
        });
}

function deleteLineButton(specs: { details: WhereToFix, location: Location, previousContent: string, message: string }): Action {
    return buttonForCommand({ text: "Delete line" },
        "DeleteLine", {
            "targets.owner": specs.details.repo.owner,
            "targets.repo": specs.details.repo.name,
            "targets.branch": specs.details.branch,
            "previousContent": specs.previousContent,
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

class BanStringType extends RecognizedError {
    public static Name = "ban-types";

    public static recognize(tsError: RuleFailure): TripleEqualsError | null {
        if (tsError.ruleName === this.Name && tsError.failure.includes("String")) {
            return new BanStringType(tsError);
        }
        return null;
    }

    constructor(tsError: RuleFailure) {
        super(tsError,
            { color: "#20a6a0" });
    }

    public fix(details: WhereToFix, location: Location, previousContent: string): FixInfo {
        const easyFix = previousContent
            .replace(/String/g, "string");
        if (easyFix !== previousContent) {
            return {
                text: "Proposed fix: `" + easyFix.trim() + "`",
                actions: [replaceButton({
                    details, location, previousContent,
                    newContent: easyFix, message: "lint fix: String type",
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
                text: "Proposed fix: delete the line, or replace it with a log statement",
                actions: [deleteLineButton({
                    details, location, previousContent,
                    message: "lint fix: remove console.log",
                }), buttonForCommand({ text: "log as INFO" },
                    ReplaceConsoleLogWithLogger, {
                        "targets.owner": details.repo.owner,
                        "targets.repo": details.repo.name,
                        "targets.branch": details.branch,
                        "previousContent": previousContent,
                        "lineFrom1": location.lineFrom1,
                        "message": "lint fix: replace console log with logger",
                        "path": location.path,
                    })],
            };
        } else {
            return super.fix(details, location, previousContent);
        }
    }

}

class ConstructorParentheses extends RecognizedError {
    public static Name = "new-parens";

    public static recognize(tsError: RuleFailure): ConstructorParentheses | null {
        if (tsError.ruleName === this.Name) {
            return new ConstructorParentheses(tsError);
        }
        return null;
    }

    constructor(tsError: RuleFailure) {
        super(tsError,
            { color: "#e0a800" });
    }

    public fix(details: WhereToFix, location: Location, previousContent: string): FixInfo {
        const easyFix = previousContent
            .replace(/(new \w+)([^\w(])/g, "$1()$2");
        if (easyFix !== previousContent) {
            return {
                text: "Proposed fix: `" + easyFix.trim() + "`",
                actions: [replaceButton({
                    details, location, previousContent,
                    newContent: easyFix, message: "lint fix: call constructor with parentheses",
                })],
            };
        } else {
            return super.fix(details, location, previousContent);
        }
    }

}
