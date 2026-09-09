FROM docker.artifactory.nml.com/base-images/node:24.20.0@sha256:1aece18fb397e8d4e29e95b70c62c2f967ff48510a32bacc9426525288d411ad

USER 1000:1000

ENV codedir /tmp/app

WORKDIR ${codedir}

COPY --chown=1000:1000 .npmrc package.json package-lock.json ${codedir}/

COPY --chown=1000:1000 . ${codedir}

RUN npm ci

RUN npm run build
