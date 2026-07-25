import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject var profileStore: ProfileStore

    @State private var step = 0
    @State private var draft = UserProfile()

    private let totalSteps = 4

    var body: some View {
        VStack(spacing: 0) {
            ProgressView(value: Double(step + 1), total: Double(totalSteps))
                .tint(.accentColor)
                .padding(.horizontal)
                .padding(.top, 12)

            TabView(selection: $step) {
                goalStep.tag(0)
                experienceStep.tag(1)
                marketStep.tag(2)
                interestsStep.tag(3)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(.default, value: step)

            navigationBar
        }
        .background(Color(.systemGroupedBackground))
    }

    private var navigationBar: some View {
        HStack {
            if step > 0 {
                Button("Back") { withAnimation { step -= 1 } }
                    .buttonStyle(.bordered)
            }
            Spacer()
            Button(step == totalSteps - 1 ? "Get started" : "Next") {
                if step == totalSteps - 1 {
                    finish()
                } else {
                    withAnimation { step += 1 }
                }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }

    private func finish() {
        draft.completedOnboarding = true
        profileStore.profile = draft
    }

    // MARK: - Steps

    private var goalStep: some View {
        OnboardingStepContainer(
            title: "What brings you here?",
            subtitle: "We'll tailor what you see based on your answer."
        ) {
            ForEach(Goal.allCases) { goal in
                SelectableRow(
                    title: goal.title,
                    icon: goal.icon,
                    isSelected: draft.goal == goal
                ) {
                    draft.goal = goal
                }
            }
        }
    }

    private var experienceStep: some View {
        OnboardingStepContainer(
            title: "How much do you already know?",
            subtitle: "No wrong answers — this just sets the starting difficulty."
        ) {
            ForEach(ExperienceLevel.allCases) { level in
                SelectableRow(
                    title: level.title,
                    icon: "gauge.with.dots.needle.33percent",
                    isSelected: draft.experience == level
                ) {
                    draft.experience = level
                }
            }
        }
    }

    private var marketStep: some View {
        OnboardingStepContainer(
            title: "Where are you looking?",
            subtitle: "Optional — helps us frame examples closer to your market."
        ) {
            VStack(alignment: .leading, spacing: 12) {
                TextField("e.g. Singapore, London, anywhere", text: $draft.market)
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal, 4)

                let suggestions = ["Singapore", "United States", "United Kingdom", "Not sure yet"]
                FlowChips(items: suggestions, selected: draft.market) { choice in
                    draft.market = choice
                }
            }
        }
    }

    private var interestsStep: some View {
        OnboardingStepContainer(
            title: "What's on your mind most?",
            subtitle: "Pick as many as you like — we'll surface these topics first."
        ) {
            ForEach(KnowledgeCategory.allCases) { category in
                SelectableRow(
                    title: category.title,
                    icon: category.icon,
                    isSelected: draft.interests.contains(category)
                ) {
                    if draft.interests.contains(category) {
                        draft.interests.remove(category)
                    } else {
                        draft.interests.insert(category)
                    }
                }
            }
        }
    }
}

private struct OnboardingStepContainer<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(title)
                        .font(.title2.bold())
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 24)

                VStack(spacing: 10) {
                    content
                }
            }
            .padding()
        }
    }
}

private struct SelectableRow: View {
    let title: String
    let icon: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: icon)
                    .frame(width: 28)
                Text(title)
                    .multilineTextAlignment(.leading)
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color.accentColor)
                }
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? Color.accentColor.opacity(0.12) : Color(.secondarySystemGroupedBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.accentColor : .clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
    }
}

private struct FlowChips: View {
    let items: [String]
    let selected: String
    let onTap: (String) -> Void

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120))], alignment: .leading, spacing: 8) {
            ForEach(items, id: \.self) { item in
                Button {
                    onTap(item)
                } label: {
                    Text(item)
                        .font(.subheadline)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            Capsule().fill(selected == item ? Color.accentColor.opacity(0.15) : Color(.secondarySystemGroupedBackground))
                        )
                        .overlay(Capsule().stroke(selected == item ? Color.accentColor : .clear, lineWidth: 1.5))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.primary)
            }
        }
    }
}

#Preview {
    OnboardingView().environmentObject(ProfileStore())
}
