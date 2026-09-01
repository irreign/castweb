import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var profileStore: ProfileStore
    @EnvironmentObject var readingStore: ReadingStore

    private var profile: UserProfile { profileStore.profile }

    var body: some View {
        NavigationStack {
            Form {
                Section("Your answers") {
                    LabeledContent("Goal", value: profile.goal.title)
                    LabeledContent("Experience", value: profile.experience.title)
                    LabeledContent("Market", value: profile.market.isEmpty ? "Not set" : profile.market)
                    if profile.interests.isEmpty {
                        LabeledContent("Interests", value: "None selected")
                    } else {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Interests")
                            ForEach(Array(profile.interests).sorted(by: { $0.title < $1.title }), id: \.self) { interest in
                                Text("· \(interest.title)")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section("Your progress") {
                    LabeledContent("Articles read", value: "\(readingStore.readIDs.count) of \(KnowledgeContent.all.count)")
                    LabeledContent("Bookmarked", value: "\(readingStore.bookmarkedIDs.count)")
                }

                Section {
                    Button("Retake the questions") {
                        profileStore.resetOnboarding()
                    }
                }

                Section {
                    Text("Levelground exists to close the information gap between everyday buyers and the professionals around them. What you tell us here only shapes what we show you — nothing is shared, and there's nothing to buy.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Profile")
        }
    }
}

#Preview {
    ProfileView()
        .environmentObject(ProfileStore())
        .environmentObject(ReadingStore())
}
