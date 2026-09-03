//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
import Foundation

// Shared JSON decoding for the Hono API.
//
// The API returns Postgres rows serialized by JSON.stringify, so timestamps
// arrive as ISO-8601 WITH fractional seconds ("2026-07-13T18:00:00.000Z").
// Foundation's plain `.iso8601` strategy rejects fractional seconds, which
// silently broke every screen that decodes a date — so the shared decoder
// accepts both forms (and bare "yyyy-MM-dd" DATE columns) explicitly.

public enum SweeprJSON {
    public static var decoder: JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            if let date = parseDate(raw) { return date }
            throw DecodingError.dataCorrupted(DecodingError.Context(
                codingPath: decoder.codingPath,
                debugDescription: "Unparseable date: \(raw)"
            ))
        }
        return d
    }

    /// ISO-8601 with fractional seconds, without, or a bare DATE column.
    public static func parseDate(_ raw: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: raw) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        if let date = plain.date(from: raw) { return date }
        // Postgres DATE ("2026-07-13") and space-separated timestamptz text
        // ("2026-07-13 18:00:00+00") forms.
        if let date = plain.date(from: raw.replacingOccurrences(of: " ", with: "T")) { return date }
        let dayOnly = DateFormatter()
        dayOnly.dateFormat = "yyyy-MM-dd"
        dayOnly.timeZone = TimeZone(identifier: "UTC")
        dayOnly.locale = Locale(identifier: "en_US_POSIX")
        return dayOnly.date(from: raw)
    }
}
