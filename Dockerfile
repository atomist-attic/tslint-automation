FROM node:8

ENV NPM_CONFIG_LOGLEVEL warn

# I need gcloud to deploy to GKE
RUN curl -sSL https://sdk.cloud.google.com | bash
RUN gcloud auth activate-service-account --key-file linting-automation-48eb46756ce2.json
# travis will have decrypted this nice file. Do not put it in the docker image.
RUN rm linting-automation-48eb46756ce2.json

# Create app directory
RUN mkdir -p /app
WORKDIR /app

# Install app dependencies
COPY package.json /app/
RUN npm install

# Bundle app source
COPY . /app

RUN  git config --global user.email "bot@atomist.com"
RUN  git config --global user.name "Atomist Bot"


ENV SUPPRESS_NO_CONFIG_WARNING true

EXPOSE 2866

CMD [ "npm", "start" ]

