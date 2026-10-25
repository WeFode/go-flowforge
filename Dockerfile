FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.25-alpine AS server
WORKDIR /src
ENV GOWORK=off CGO_ENABLED=0
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/ cmd/
COPY internal/ internal/
COPY pkg/ pkg/
COPY examples/ examples/
RUN go build -trimpath -ldflags="-s -w" -o /flowforge ./cmd/flowforge
RUN go build -trimpath -ldflags="-s -w" -o /erp-demo ./examples/erp/worker

FROM alpine:3.22 AS runtime
RUN apk add --no-cache ca-certificates && addgroup -S app && adduser -S app -G app
WORKDIR /app
USER app

FROM runtime AS erp-demo
COPY --from=server /erp-demo /app/erp-demo
EXPOSE 8090
ENTRYPOINT ["/app/erp-demo"]

FROM runtime AS app
COPY --from=server /flowforge /app/flowforge
COPY --from=web /src/web/dist /app/web/dist
EXPOSE 8088
ENTRYPOINT ["/app/flowforge"]
