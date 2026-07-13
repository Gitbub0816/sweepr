/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

//! Minimal Neon serverless SQL-over-HTTP client (the same wire protocol
//! @neondatabase/serverless uses). Every query is parameterized — SQL text is
//! always a compile-time string, values only ever travel as $n params.

use serde::Deserialize;
use serde_json::Value;
use worker::{Fetch, Headers, Method, Request, RequestInit};

pub struct Db {
    endpoint: String,
    connection_string: String,
}

#[derive(Deserialize)]
struct NeonResponse {
    #[serde(default)]
    rows: Vec<Value>,
    #[serde(default, rename = "rowCount")]
    row_count: Option<u64>,
    #[serde(default)]
    message: Option<String>,
}

#[derive(Debug)]
pub struct DbError(pub String);

impl Db {
    /// Derive the HTTP endpoint from a postgres:// connection string.
    pub fn from_connection_string(connection_string: &str) -> Result<Self, DbError> {
        let host = connection_string
            .split('@')
            .nth(1)
            .and_then(|rest| rest.split('/').next())
            .map(|hostport| hostport.split(':').next().unwrap_or(hostport))
            .filter(|h| !h.is_empty())
            .ok_or_else(|| DbError("invalid connection string".into()))?;
        Ok(Self {
            endpoint: format!("https://{host}/sql"),
            connection_string: connection_string.to_string(),
        })
    }

    pub async fn query(&self, sql: &'static str, params: &[Value]) -> Result<Vec<Value>, DbError> {
        let body = serde_json::json!({ "query": sql, "params": params });
        let headers = Headers::new();
        headers
            .set("Neon-Connection-String", &self.connection_string)
            .map_err(|e| DbError(e.to_string()))?;
        headers
            .set("Content-Type", "application/json")
            .map_err(|e| DbError(e.to_string()))?;
        // Text-mode JSON output with parsed arrays keeps row values as JSON.
        headers
            .set("Neon-Raw-Text-Output", "false")
            .map_err(|e| DbError(e.to_string()))?;
        headers
            .set("Neon-Array-Mode", "false")
            .map_err(|e| DbError(e.to_string()))?;

        let init = RequestInit {
            method: Method::Post,
            headers,
            body: Some(body.to_string().into()),
            ..Default::default()
        };
        let req = Request::new_with_init(&self.endpoint, &init)
            .map_err(|e| DbError(e.to_string()))?;
        let mut resp = Fetch::Request(req)
            .send()
            .await
            .map_err(|e| DbError(e.to_string()))?;
        let status = resp.status_code();
        let parsed: NeonResponse = resp
            .json()
            .await
            .map_err(|e| DbError(format!("db response parse: {e}")))?;
        if status != 200 {
            // Surface the Postgres error message class only; params never echo.
            return Err(DbError(parsed.message.unwrap_or_else(|| format!("db http {status}"))));
        }
        let _ = parsed.row_count;
        Ok(parsed.rows)
    }

    /// Execute expecting EXACTLY ONE affected/returned row (claim-then-act).
    /// Zero rows = the conditional WHERE lost — treated as failure by callers.
    pub async fn query_one(
        &self,
        sql: &'static str,
        params: &[Value],
    ) -> Result<Option<Value>, DbError> {
        let mut rows = self.query(sql, params).await?;
        if rows.len() > 1 {
            return Err(DbError("expected at most one row".into()));
        }
        Ok(rows.pop())
    }
}
