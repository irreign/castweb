import XCTest
@testable import Hearth

final class CalendarDateTests: XCTestCase {
    func testISOStringRoundTrip() throws {
        let date = CalendarDate(isoString: "2026-10-15")
        XCTAssertEqual(date?.description, "2026-10-15")
    }

    func testInvalidStringFailsToParse() {
        XCTAssertNil(CalendarDate(isoString: "not-a-date"))
    }

    func testComparable() {
        let a = CalendarDate(year: 2026, month: 10, day: 15)
        let b = CalendarDate(year: 2026, month: 10, day: 24)
        XCTAssertTrue(a < b)
        XCTAssertFalse(b < a)
    }

    func testDecodingFromJSON() throws {
        let json = "\"2026-12-25\"".data(using: .utf8)!
        let decoded = try JSONDecoder().decode(CalendarDate.self, from: json)
        XCTAssertEqual(decoded, CalendarDate(year: 2026, month: 12, day: 25))
    }

    func testClockTimeFormatting() {
        let time = ClockTime(hour: 15, minute: 0)
        XCTAssertEqual(time.description, "15:00")
    }

    func testClockTimeParsesSecondsSuffix() {
        // Postgres `time` columns serialize with seconds ("15:00:00") —
        // our parser only needs hour/minute, but must not choke on it.
        XCTAssertEqual(ClockTime(isoString: "15:00:00"), ClockTime(hour: 15, minute: 0))
    }
}
