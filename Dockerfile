FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    xvfb \
    mesa-gl \
    mesa-egl \
    xcb-util-cursor \
    xcb-util \
    xcb-util-image \
    xcb-util-keysyms \
    xcb-util-renderutil \
    xcb-util-wm

ENV ELECTRON_DISABLE_SANDBOX=true
ENV ELECTRON_DISABLE_GPU=true

COPY package*.json ./

RUN npm install --production

COPY . .

RUN mkdir -p /app/data

ENV POMODORO_DATA_DIR=/app/data

VOLUME ["/app/data"]

CMD ["xvfb-run", "-a", "npm", "start"]
