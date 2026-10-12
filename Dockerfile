FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
