# PRDF Client Portal – UI/UX Assessment (2026‑06‑30)

## Overview

The **PRDF Client Portal** (hosted at `prdf‑lms.vercel.app`) is a one‑page marketing and application portal for South African businesses seeking funding.  The landing page contains a hero section with a loan calculator, eligibility criteria, a “path to funding” graphic, descriptions of non‑financial support services, a document checklist and a final call‑to‑action.  As of **30 June 2026**, the site loads without authentication and uses a responsive design, but several interface and user‑experience issues were observed.  The review below highlights these problems and offers recommendations based on recognized usability and accessibility guidelines.

## General UX Problems

- **Lack of navigation & orientation** – The page is long and does not provide any navigation menu or “back to top” link.  Users cannot quickly jump to sections such as eligibility, services or documents.  Nielsen Norman’s heuristics stress that systems should keep users informed about status and provide feedback【266757118574651†L94-L101】.  Without a menu, visitors may get lost or discouraged.
- **Too many call‑to‑action (CTA) buttons** – “Apply Now” and “Check Eligibility” buttons appear repeatedly across sections.  Overuse can dilute their importance, confuse users about the next action and clutter the layout.
- **Inconsistent terminology** – Some sections use internal jargon (e.g., “BBB‑EE Score” without expansion), which may violate the heuristic to speak the user’s language and use familiar words【266757118574651†L127-L134】.
- **No feedback on interactions** – The sliders on the loan calculator show values, but there is no immediate textual feedback (e.g., error messages or explanations).  Clear system status feedback is critical【266757118574651†L94-L119】.
- **Color contrast issues** – The eligibility section uses white or pale text on blue backgrounds and green/red icons for check‑ and cross‑lists.  The WCAG 2.2 guidelines recommend a minimum contrast ratio of 4.5:1 for normal text【499265751560846†L36-L55】.  Small pale text on a blue background may not meet this ratio, and green/red indicators alone may be unreadable by color‑blind users.
- **Small touch targets** – Some buttons and links (e.g., the slider handles, the “Sign In” link) appear small.  WCAG 2.5.8 notes that pointer targets should be at least 24×24 CSS pixels and separated so users with motor impairments can activate them【719054865452831†L25-L45】.
- **Absence of accessibility features** – The page lacks alt text for icons; the W3C alt decision tree instructs that functional images (e.g., icons used as buttons) should include alt attributes describing their function【93617920490618†L123-L146】.  There is also no obvious keyboard navigation support for the sliders (important for screen‑reader users).  Equalize Digital warns that inaccessible sliders may prevent blind users from knowing what slide they are on and impede keyboard‑only navigation【430621677485827†L220-L238】.

## Section‑by‑Section Issues & Recommendations

| Section | Observations & Issues | Recommendations |
| --- | --- | --- |
| **Hero section & loan calculator** | • Contains a headline, description, CTAs and two sliders for **loan amount** and **term**.  Selecting a precise value on a slider can be difficult, especially on touch screens or for users with motor impairments.  Nielsen Norman Group notes that sliders are **imprecise** and should only be used when exact values are not important【531131310549423†L68-L76】.  The step labels (“R0” on the left, “R500 000” on the right) are small and may be covered by the user’s thumb, contrary to slider best practices【531131310549423†L151-L167】.  The calculator lacks an option to enter the amount manually.  | • Provide an alternative input method (e.g., numeric text fields) to allow precise entry; use sliders only for approximate ranges.  NN/G recommends offering options to tap or type rather than rely solely on drag gestures【531131310549423†L173-L179】.  
• Place labels and current value above the slider so they remain visible while dragging【531131310549423†L151-L167】.  
• Improve contrast for text and buttons; ensure all text meets the 4.5:1 contrast ratio【499265751560846†L36-L55】.  
• Add a descriptive heading for the calculator and instructions, and announce updates via ARIA to assist screen‑readers. |
| **About PRDF & metrics** | • This section lists totals for funding disbursed, businesses funded and jobs created.  The numbers are large but there is no context (e.g., timeframe).  Icons appear purely decorative without alt text.  | • Provide additional context (e.g., “R3 billion disbursed since 2015”).  
• Add alt text or ARIA labels to icons so screen readers can convey their meaning【93617920490618†L123-L138】. |
| **Eligibility (Do you qualify?)** | • Presented in a blue box with two columns: “Who qualifies” with green checkmarks and “Who does not qualify” with red crosses.  The text is cramped and uses internal terms like “Sole Prop.”  Contrast may be insufficient for some users; the red/green color coding alone is inaccessible to color‑blind users.  | • Replace color‑only indicators with icons and descriptive text; include accessible labels.  
• Simplify language (e.g., “Sole Proprietorship” instead of “Sole Prop.”) and avoid jargon【266757118574651†L127-L134】.  
• Ensure the blue background and white text meet WCAG contrast requirements【499265751560846†L36-L55】.  
• Consider using a simple checklist with ticks and crosses accompanied by alt text describing each criterion. |
| **Path to funding timeline** | • Shows four numbered steps horizontally.  On smaller screens, the numbers may wrap or become difficult to follow.  There is no progress indicator when the user moves through the actual application later.  | • When designing multi‑step processes, W3C recommends dividing long forms into logical steps and providing clear progress indicators【953166320029743†L94-L125】.  Apply this principle: add a visual step indicator to the actual application flow (e.g., Step 1 of 4).  
• Ensure the timeline is responsive; on mobile it could collapse into a vertical list with numbering for clarity. |
| **Non‑financial support services** | • Presented as a six‑item grid.  On narrow devices this may cause horizontal scrolling.  Each card contains an icon and a paragraph of text; the icons lack alt text.  | • Ensure the grid is responsive—use a 2‑column layout on desktop and a single‑column stack on mobile.  
• Add alt text to icons【93617920490618†L123-L146】.  
• Use concise headings and limit text length to improve readability. |
| **Documents required** | • Lists required documents in separate boxes but includes heavy paragraphs.  Some items use paragraphs instead of bullet points, making scanning hard.  | • Use bulleted lists or short phrases rather than dense paragraphs.  Keep table cells or cards short to improve scannability.  
• Clarify whether documents need to be certified, scanned or uploaded. |
| **Final call‑to‑action** | • Contains a statement (“Ready to grow your business?”) and duplicated CTAs (“Check Eligibility” and “Apply Now”).  The section uses small icons (a shield, a clock, etc.) with no alt text.  | • Consolidate CTAs into a single prominent button to reduce decision fatigue.  
• Provide alt text for icons and ensure they are large enough to meet the 24×24 px target size guideline【719054865452831†L25-L45】.  
• Consider adding a short description of the application process or timeline near the CTA to set expectations. |

## Additional Recommendations

1. **Implement a sticky navigation bar.**  Provide links to each major section (Eligibility, Funding Steps, Support Services, Documents, Contact) so users can navigate easily without scrolling.  This addresses the heuristic of user control and freedom, giving users an “emergency exit” to other parts of the page【266757118574651†L161-L169】.

2. **Add a persistent “Back to Top” button** that appears after the user scrolls down; this small improvement boosts usability and reduces scrolling fatigue.

3. **Improve responsive design** by testing on different screen sizes.  Ensure that sections stack appropriately, sliders remain usable, and text does not overlap or become too small.  Provide accessible labels for mobile navigation.

4. **Provide contextual help and error prevention** in forms.  When users apply for funding, ask only essential information at each step.  Provide clear instructions on each page and prevent errors (e.g., validate numbers, display inline error messages) – aligning with the heuristic of error prevention【266757118574651†L214-L235】.

5. **Enhance accessibility:**
   - Use semantic HTML elements (e.g., `<nav>`, `<header>`, `<main>`, `<footer>`) and ARIA landmarks to aid screen‑reader navigation.
   - Ensure all interactive elements are operable via keyboard; the accessibility guidelines warn that sliders can impede keyboard‑only users【430621677485827†L220-L238】.
   - Provide skip links to allow users to bypass repeated content.
   - Add focus indicators for links and buttons, and ensure focus order follows the visual layout.
   - Include descriptive alt text for all icons and images; functional images need alt attributes that communicate their purpose【93617920490618†L123-L146】.

6. **Clarify language and tone.**  Use plain, concise language free of jargon to match users’ mental models【266757118574651†L127-L134】.  Avoid abbreviations unless they are universally recognized.

7. **Use analytics to test CTAs.**  Consolidate CTAs and measure conversion to determine which wording (“Check Eligibility” vs. “Apply Now”) is most effective.  Also consider microcopy near CTAs to reassure users (e.g., “It only takes 5 minutes”).

8. **Add social proof and testimonials.**  To increase trust, include quotes from funded businesses or ratings.  Keep content short and accessible.

## Conclusion

The PRDF Client Portal provides a clear value proposition but suffers from navigation deficiencies, inconsistent language, insufficient accessibility and reliance on sliders for precise inputs.  By applying established usability heuristics such as visibility of system status, recognition over recall, consistency and error prevention【266757118574651†L94-L169】, and adhering to WCAG guidelines for contrast and target sizes【499265751560846†L36-L55】【719054865452831†L25-L45】, the portal can offer a much more inclusive and efficient user experience.  Implementing the recommendations above will help potential applicants understand the funding process, feel confident during the application and move forward with ease.
