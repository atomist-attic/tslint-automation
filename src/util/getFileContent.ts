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

import { Project } from "@atomist/automation-client/project/Project";
import { api } from "./gitHubApi";

export function getFileContentFromGithub(token: string,
                                         repo: { name: string, owner: string, ref: string },
                                         filePath: string): Promise<string> {

    return api(token).repos.getContent({
        owner: repo.owner,
        repo: repo.name,
        path: filePath,
        ref: repo.ref,
    }).then(content => {
        const unencoded: string = new Buffer(content.data.content, "base64").toString("ascii");

        console.log("unencoded: " + unencoded);

        return Promise.resolve(unencoded);
    });
}

export function getFileContentFromProject(project: Project,
                                          filePath: string): Promise<string> {

    return project.findFile(filePath).then(f => f.getContent());
}
