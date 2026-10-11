---
name: UK Expense Tracker
description: A fast, private, locally-hosted personal finance and expense tracking hub.
colors:
  primary: "#e74c3c"
  neutral-bg: "#263238"
  neutral-bg-secondary: "#1b262c"
  neutral-text: "#ffffff"
  chart-income: "#2ecc71"
  chart-committed: "#8b0000"
  chart-variable: "#f39c12"
  chart-category: "#9b59b6"
  chart-merchant: "#e67e22"
typography:
  body:
    fontFamily: "sans-serif"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-text}"
    rounded: "8px"
    padding: "8px 16px"
  input-field:
    backgroundColor: "{colors.neutral-bg-secondary}"
    textColor: "{colors.neutral-text}"
    rounded: "8px"
---

# Design System: UK Expense Tracker

## Overview

**Creative North Star: "The Command Center"**

The UK Expense Tracker is a focused, high-contrast, data-dense application designed for rapid scanning and operation. It eschews unnecessary ornamentation in favor of a sleek, modern, and punchy aesthetic, aggressively using color to highlight key actions and semantic meaning.

**Key Characteristics:**
- High data density over whitespace.
- Semantic chart colors that carry strict financial meaning.
- Nocturnal, deep slate canvas to reduce eye strain during intensive data analysis.
- Utilitarian component language optimized for fast, reliable data entry.

## Colors

Deep Slate & Crimson: a serious, nocturnal palette with a sharp red accent for attention.

### Primary
- **Crimson Action** (#e74c3c): Used aggressively for primary buttons, critical alerts, and key interactions.

### Semantic Chart Colors
- **Income Green** (#2ecc71): Strict financial meaning. Always represents positive cash flow / income.
- **Committed Baseline Red** (#8b0000): Strict financial meaning. Always represents fixed, recurring, committed spend.
- **Variable Lifestyle Orange** (#f39c12): Strict financial meaning. Always represents discretionary, variable spend.
- **Categorical Purple** (#9b59b6): Used for category breakdowns where semantic meaning is not strict.
- **Merchant Orange-Red** (#e67e22): Used for merchant breakdowns.

### Neutral
- **Deep Slate Background** (#263238): The primary app background.
- **Container Dark Slate** (#1b262c): Secondary background used to separate sections, sidebars, and data containers.
- **Crisp White** (#ffffff): Primary text color for maximum contrast against the slate backgrounds.

### Named Rules
**The Strict Semantic Rule.** Financial chart colors are not decorative. Green is always income, Dark Red is always committed spend, and Orange is always variable spend.

## Typography

**Body Font:** sans-serif

**Character:** Clean, system-native, and legible. Typography gets out of the way to let the numbers speak.

### Hierarchy
- **Body** (400, 16px): Standard data and paragraph text.

## Layout

The application relies on a fluid, full-width container model typical of Streamlit (`layout="wide"`). Mobile responsiveness is handled natively by Streamlit's stack-collapse behavior for columns and sidebars.

## Elevation & Depth

Flat and container-driven. The interface relies entirely on distinct background colors (#1b262c vs #263238) rather than shadows to create structural hierarchy and separate sections.

### Named Rules
**The Flat Structure Rule.** No drop shadows or ambient depth. Hierarchy is established purely through background contrast and spacing.

## Shapes

Utilitarian and crisp. Components feature slight rounding (typically 8px) to soften the dense data presentation, but remain fundamentally boxy to maximize spatial efficiency.

## Components

Utilitarian and crisp. Standard Streamlit components that prioritize reliable data entry over expressive flair.

### Buttons
- **Shape:** 8px radius.
- **Primary:** Crimson (#e74c3c) background with white text. Punchy and unmissable.

### Inputs / Fields
- **Style:** Flat, dark background (#1b262c) sitting inside the main canvas.
- **Focus:** Crisp border highlight provided by Streamlit default behaviors.

### Dataframes & Tables
- **Style:** High-density grids with clear column headers. Zebra striping or subtle border lines to aid horizontal tracking.

## Do's and Don'ts

### Do:
- **Do** use #e74c3c aggressively for the most important action on a screen.
- **Do** map financial data rigidly to the established Income/Committed/Variable chart colors.
- **Do** rely on background color contrast (#1b262c on #263238) to define sections.

### Don't:
- **Don't** introduce new chart colors for income or basic spend types; stick to the semantic palette.
- **Don't** use drop shadows to separate cards or containers.
- **Don't** sacrifice data density for whitespace; the user values seeing more rows over spacious layouts.
