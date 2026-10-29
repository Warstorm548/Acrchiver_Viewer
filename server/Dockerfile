# Builds a static binary and runs it on a minimal image with no shell or package manager.
# Multi-platform: the Go compiler runs on the build machine's platform and cross-compiles for the
# target (docker buildx --platform linux/amd64,linux/arm64), so no emulation is needed.
FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS build
ARG TARGETOS TARGETARCH
WORKDIR /src
COPY go.mod go.sum* ./
# the patched sevenzip copy is a replace target, needed to resolve the module graph
COPY third_party ./third_party
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w" -o /archive-helper ./cmd/archive-helper

FROM gcr.io/distroless/static-debian12
LABEL org.opencontainers.image.source="https://github.com/Warstorm548/Acrchiver_Viewer" \
      org.opencontainers.image.description="Archive Viewer helper: opens large archives next to OpenCloud" \
      org.opencontainers.image.licenses="AGPL-3.0"
COPY --from=build /archive-helper /archive-helper
ENTRYPOINT ["/archive-helper"]
