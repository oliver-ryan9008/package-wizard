FROM node:24.20.0

USER 1000:1000

ENV codedir=/tmp/app

WORKDIR ${codedir}

COPY --chown=1000:1000 .npmrc package.json package-lock.json ${codedir}/

COPY --chown=1000:1000 . ${codedir}

RUN npm ci

RUN npm run build
