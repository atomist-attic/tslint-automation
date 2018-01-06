FROM node:8

ENV NPM_CONFIG_LOGLEVEL warn

# I need gcloud to deploy to GKE
RUN curl -sSL https://sdk.cloud.google.com > /tmp/gcl && bash /tmp/gcl --install-dir=/gcloud
RUN echo $(ls /gcloud/google-cloud-sdk/bin)
ENV PATH $PATH:/gcloud/google-cloud-sdk/bin

RUN gcloud --quiet components install kubectl


# Create app directory
RUN mkdir -p /app
WORKDIR /app

# Install app dependencies
COPY package.json /app/
RUN npm install

# Bundle app source
COPY . /app
RUN rm -f linting-automation-48eb46756ce2.json

RUN  git config --global user.email "bot@atomist.com"
RUN  git config --global user.name "Atomist Bot"


ENV SUPPRESS_NO_CONFIG_WARNING true

EXPOSE 2866

CMD [ "npm", "start" ]

