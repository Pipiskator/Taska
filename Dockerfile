# stage 1: build
FROM node:20 AS build
WORKDIR /app

# Копируем только package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем исходники
COPY . .

# Даем права на выполнение vite
RUN chmod +x node_modules/.bin/vite

# Собираем фронтенд
RUN npm run build

# stage 2: serve with nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]