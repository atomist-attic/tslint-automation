
import { CommandHandler, HandleCommand, HandlerContext } from "@atomist/automation-client";
import { configuration } from "../atomist.config";

@CommandHandler("Reveal the running version", "hello linting-automation")
export class HelloWorld implements HandleCommand {

    public handle(context: HandlerContext) {
        return context.messageClient.respond(
            `Hello from ${configuration.name}:${configuration.version}`,
        );
    }

}
