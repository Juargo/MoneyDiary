# Delta for public-landing

## ADDED Requirements

### Requirement: Bank Logo Rendering

The Bancos section MUST render SVG logos for each supported bank instead of emoji characters.

#### Scenario: SVG renders for each bank

- GIVEN the Bancos section is visible
- WHEN the page loads
- THEN each bank card MUST display an SVG image with descriptive `alt` text
- AND no emoji SHOULD appear as bank icon

#### Scenario: SVG load failure

- GIVEN a bank SVG file fails to load
- WHEN the image errors
- THEN the bank name MUST display as text fallback
- AND the card layout MUST NOT break

### Requirement: App Screenshot Rendering

The Capturas section MUST display real app screenshots with descriptive alt text instead of placeholder frames.

#### Scenario: Screenshots render

- GIVEN the Capturas section
- WHEN the page loads
- THEN each screenshot MUST load from a static asset path
- AND MUST include descriptive `alt` text

#### Scenario: Mobile responsive

- GIVEN a 375px viewport
- WHEN viewing the gallery
- THEN screenshots MUST stack vertically
- AND MUST maintain aspect ratio

### Requirement: Social Proof Bar

A stats bar with key metrics MUST render below the hero section.

#### Scenario: Stats visible

- GIVEN the social proof section
- WHEN the page renders
- THEN each stat MUST display a numeric value and a descriptive label
- AND the bar MUST be visually distinct from adjacent sections

#### Scenario: Zero-state

- GIVEN no stats metric is configured
- WHEN the section renders
- THEN zero values MUST display without animation placeholders

### Requirement: FAQ Accordion

A FAQ section with toggle behavior MUST render using static markup and client-side CSS/JS only. No backend calls.

#### Scenario: Expand answer

- GIVEN a FAQ question
- WHEN the user clicks it
- THEN the answer MUST expand below it

#### Scenario: Collapse answer

- GIVEN a FAQ answer is expanded
- WHEN the user clicks the same question again
- THEN the answer MUST collapse

#### Scenario: Keyboard accessible

- GIVEN a keyboard-only visitor
- WHEN they Tab to a FAQ question and press Enter
- THEN the answer MUST toggle visibility
- AND focus MUST remain on the question

### Requirement: Footer Privacy Link

The footer's privacy link MUST point to a valid privacy policy URL.

#### Scenario: Valid href

- GIVEN the footer renders
- WHEN inspecting the privacy link
- THEN its `href` MUST point to a valid URL
- AND it MUST NOT equal `#`
