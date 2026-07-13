# Copyright © 2026–Present ClearKey Solutions, LLC.
# Proprietary & Confidential. Internal Use Only.
#
# Multi-stage build for the native Sweepr auth service. The runtime image
# carries ONLY the compiled binary + CA certs — no compiler, source, or secrets.

FROM rust:1-bookworm AS builder

WORKDIR /build

# Single-crate project (this directory is the crate root — the Fly build
# context is services/auth-broker, not the monorepo root). Copy manifests
# first for dependency-layer caching, then sources.
COPY Cargo.toml Cargo.lock ./
COPY src ./src

# No compile-time DB checks (sqlx runtime queries only), so no DATABASE_URL is
# needed at build time. --locked pins to Cargo.lock.
RUN cargo build --locked --release --bin sweepr-auth

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin authservice

COPY --from=builder /build/target/release/sweepr-auth /usr/local/bin/sweepr-auth

USER 10001:10001

ENV PORT=8080
ENV RUST_LOG=info

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/sweepr-auth"]
