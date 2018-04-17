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

import "mocha";
import { getFileContentFromGithub } from "../../src/util/getFileContent";

const MyGithubToken = process.env.GITHUB_TOKEN;

describe("getting the file content", () => {

    it.skip("fetches stuff", done => {

        getFileContentFromGithub(MyGithubToken, { name: "carrot", owner: "satellite-of-love", ref: "master"}, "README.md")
            .then(line => {
                console.log("Woo: " + line);
            })
            .then(() => done(), done);
    });

});
