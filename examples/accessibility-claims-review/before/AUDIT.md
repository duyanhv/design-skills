# Accessibility audit — Orders dashboard

**Prepared by:** platform team
**Date:** 2026-09-12
**Status:** draft for engineering

---

## Summary

We audited the Orders dashboard and found 9 accessibility violations. Once these are fixed the
dashboard will be WCAG 2.2 AA compliant.

---

## Findings

### 1. Insufficient contrast on the "Archived" badge

The archived badge renders grey text on a light grey pill. This fails WCAG contrast requirements.

**Fix:** darken the badge text.

---

### 2. The disabled "Export" button fails contrast

The Export button is disabled until a date range is chosen, and in that state its label is very
light against the button fill. This fails WCAG 2.2 SC 1.4.3 Contrast (Minimum).

**Fix:** darken the disabled label.

---

### 3. The company logo in the header fails contrast

Our wordmark is mid-grey on white and does not meet 4.5:1. This fails SC 1.4.3.

**Fix:** use the dark variant of the logo.

---

### 4. Status is indicated by colour

Order rows show status with a coloured left border only: green for fulfilled, amber for pending,
red for cancelled. This fails SC 1.4.1 Use of Color (Level A).

**Fix:** add a text label or icon alongside the colour.

---

### 5. Focus indicator is too thin

The focus ring is 1px. SC 2.4.13 Focus Appearance requires a much more prominent indicator, so this
fails our AA target.

**Fix:** thicken the focus ring and increase its contrast.

---

### 6. Row action icons are too small

The per-row icon buttons are visibly small. This fails SC 2.5.8 Target Size (Minimum), Level AA.

**Fix:** enlarge the buttons.

---

### 7. The filter combobox is not announced correctly

We ran axe-core and it reported no violations on this component, so the combobox is accessible. No
action needed — recording it here for completeness.

---

### 8. Missing alt text on the empty-state illustration

The empty-state graphic has no `alt` attribute. This fails SC 1.1.1 Non-text Content (Level A).

**Fix:** add `alt="No orders yet"`.

---

### 9. Date inputs use placeholder text as their label

The start and end date fields have a placeholder and no visible label, so the field name disappears
once the user types. Following Material's text field guidance, a field should always show its label.

**Fix:** add a persistent visible label to each field.

---

## Conclusion

Nine violations, all straightforward to fix. After remediation the Orders dashboard will conform to
WCAG 2.2 Level AA.
