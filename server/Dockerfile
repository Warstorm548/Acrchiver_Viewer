# Builds a static binary and runs it on a minimal image with no shell or package manager.
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
# the patched sevenzip copy is a replace target, needed to resolve the module graph
COPY third_party ./third_party
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /archive-helper ./cmd/archive-helper

FROM gcr.io/distroless/static-debian12
COPY --from=build /archive-helper /archive-helper
EXPOSE 8080
ENTRYPOINT ["/archive-helper"]
