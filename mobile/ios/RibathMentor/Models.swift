import Foundation

struct StoredSession: Codable {
    let deviceId: String
    let refreshToken: String
}

struct LoginRequest: Encodable {
    let email: String
    let password: String
    let installationId: String
    let platform = "ios"
    let deviceName: String
    let appVersion: String
    let osVersion: String
    let pushToken: String? = nil
}

struct RefreshRequest: Encodable {
    let deviceId: String
    let refreshToken: String
}

struct DeviceResponse: Decodable { let id: String }

struct LoginResponse: Decodable {
    let success: Bool
    let accessToken: String
    let refreshToken: String
    let device: DeviceResponse
}

struct RefreshResponse: Decodable {
    let success: Bool
    let accessToken: String
    let refreshToken: String
}

struct MentorProfile: Codable {
    let id: String
    let email: String
    let name: String
    let role: String
}

struct AcademicYear: Codable { let id: String?; let name: String; let mode: String }

struct StudentSummary: Codable, Identifiable {
    var id: String { admNo }
    let admNo: String
    let name: String
    let standard: String?

    enum CodingKeys: String, CodingKey {
        case admNo = "adm_no"
        case name, standard
    }
}

struct HifzEntrySummary: Codable, Identifiable {
    let id: String
    let studentId: String
    let entryDate: String
    let mode: String
    let surahName: String
    let startVerse: Int
    let endVerse: Int
    let notes: String?
    let version: Int64

    enum CodingKeys: String, CodingKey {
        case id, mode, notes
        case studentId = "student_id"
        case entryDate = "entry_date"
        case surahName = "surah_name"
        case startVerse = "start_v"
        case endVerse = "end_v"
        case version = "entity_version"
    }

    init(id: String, studentId: String, entryDate: String, mode: String, surahName: String, startVerse: Int, endVerse: Int, notes: String?, version: Int64) {
        self.id = id; self.studentId = studentId; self.entryDate = entryDate; self.mode = mode
        self.surahName = surahName; self.startVerse = startVerse; self.endVerse = endVerse
        self.notes = notes; self.version = version
    }

    init(from decoder: Decoder) throws {
        let box = try decoder.container(keyedBy: CodingKeys.self)
        id = try box.decode(String.self, forKey: .id)
        studentId = try box.decode(String.self, forKey: .studentId)
        entryDate = String(try box.decode(String.self, forKey: .entryDate).prefix(10))
        mode = try box.decode(String.self, forKey: .mode)
        surahName = try box.decode(String.self, forKey: .surahName)
        startVerse = try box.decode(Int.self, forKey: .startVerse)
        endVerse = try box.decode(Int.self, forKey: .endVerse)
        notes = try box.decodeIfPresent(String.self, forKey: .notes)
        if let number = try? box.decode(Int64.self, forKey: .version) { version = number }
        else { version = Int64((try? box.decode(String.self, forKey: .version)) ?? "") ?? 0 }
    }
}

struct HifzDraft: Codable, Identifiable {
    var id: String { mutationId }
    let mutationId: String
    let studentId: String
    let entryDate: String
    let mode: String
    let surahName: String
    let startVerse: Int
    let endVerse: Int
    let notes: String?
}

struct HifzMutationResponse: Decodable {
    let success: Bool
    let mutationId: String
    let status: String
    let replayed: Bool
    let entry: HifzEntrySummary
}

struct BootstrapResponse: Decodable {
    let success: Bool
    let syncCursor: Int64
    let profile: MentorProfile
    let academicYear: AcademicYear
    let students: [StudentSummary]
    let hifzEntries: [HifzEntrySummary]
}

struct SyncResponse: Decodable {
    let success: Bool
    let changes: [SyncChange]
    let nextCursor: Int64
    let hasMore: Bool
}

struct SyncChange: Decodable {
    let entityType: String
    let entityId: String
    let operation: String
    let entityVersion: Int64
    let payload: [String: JSONValue]?

    enum CodingKeys: String, CodingKey {
        case entityType = "entity_type"
        case entityId = "entity_id"
        case operation
        case entityVersion = "entity_version"
        case payload
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        entityType = try container.decode(String.self, forKey: .entityType)
        entityId = try container.decode(String.self, forKey: .entityId)
        operation = try container.decode(String.self, forKey: .operation)
        if let numeric = try? container.decode(Int64.self, forKey: .entityVersion) {
            entityVersion = numeric
        } else {
            entityVersion = Int64(try container.decode(String.self, forKey: .entityVersion)) ?? 0
        }
        payload = try container.decodeIfPresent([String: JSONValue].self, forKey: .payload)
    }
}

enum JSONValue: Codable {
    case string(String), number(Double), bool(Bool), object([String: JSONValue]), array([JSONValue]), null

    init(from decoder: Decoder) throws {
        let box = try decoder.singleValueContainer()
        if box.decodeNil() { self = .null }
        else if let value = try? box.decode(Bool.self) { self = .bool(value) }
        else if let value = try? box.decode(Double.self) { self = .number(value) }
        else if let value = try? box.decode(String.self) { self = .string(value) }
        else if let value = try? box.decode([String: JSONValue].self) { self = .object(value) }
        else { self = .array(try box.decode([JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var box = encoder.singleValueContainer()
        switch self {
        case .string(let value): try box.encode(value)
        case .number(let value): try box.encode(value)
        case .bool(let value): try box.encode(value)
        case .object(let value): try box.encode(value)
        case .array(let value): try box.encode(value)
        case .null: try box.encodeNil()
        }
    }

    var string: String? { if case .string(let value) = self { value } else { nil } }
    var integer: Int? {
        switch self {
        case .number(let value): Int(value)
        case .string(let value): Int(value)
        default: nil
        }
    }
}

struct HomeSnapshot {
    let profile: MentorProfile
    let academicYear: String
    let students: [StudentSummary]
    let hifzEntries: [HifzEntrySummary]
    let pendingDraftCount: Int
    let cursor: Int64
    let cached: Bool
}
