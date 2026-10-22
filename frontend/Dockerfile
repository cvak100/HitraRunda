FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY docker-entrypoint.sh /frontend-entrypoint.sh
RUN sed -i 's/\r$//' /frontend-entrypoint.sh && chmod +x /frontend-entrypoint.sh
EXPOSE 5008
ENTRYPOINT ["/frontend-entrypoint.sh"]
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5008"]
