FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=4174 HOST=0.0.0.0 JOBSTER_DB=/data/jobster.sqlite
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 4174
CMD ["node", "server/index.mjs"]
