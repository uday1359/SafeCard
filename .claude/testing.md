# TESTING DEVELOPMENT RULES

## 1. TESTING SCOPE

1. These rules apply only to application testing and test report creation.
2. Testing MUST be based on the project requirements and implemented functionality.
3. Testing MUST cover positive and negative scenarios.
4. Testing MUST cover functional behavior, validation, UI behavior, API behavior, and error handling where applicable.
5. Testing MUST NOT be limited to happy-path scenarios.
6. Every important requirement SHOULD have at least one corresponding test case.
7. Test cases MUST be clear enough for another tester to execute without additional explanation.

---

## 2. TESTING PROCESS

The testing process MUST follow this sequence:

```text
Requirement
    ↓
Test Scenario
    ↓
Test Case
    ↓
Test Data
    ↓
Test Execution
    ↓
Actual Result
    ↓
Compare With Expected Result
    ↓
PASS / FAIL / BLOCKED
    ↓
Defect Identification
    ↓
Retest
    ↓
Final Test Report
```

Rules:

1. Requirements MUST be understood before creating test cases.
2. Test scenarios MUST be identified before detailed test cases.
3. Test cases MUST be created before execution whenever possible.
4. Actual results MUST represent what was actually observed.
5. Expected results MUST represent the required behavior.
6. A test MUST NOT be marked PASS without verification.
7. A test MUST NOT be marked FAIL without recording the observed issue.

---

## 3. REQUIREMENT-BASED TESTING

1. Every test case MUST be linked to a requirement, feature, or functionality.
2. Test cases MUST verify the intended business behavior.
3. Missing requirements MUST NOT be assumed.
4. If a requirement is unclear, identify the ambiguity instead of inventing behavior.
5. Changes to requirements MUST be reflected in affected test cases.
6. Obsolete test cases MUST be updated or clearly marked.

---

## 4. TEST CASE ID RULES

1. Every test case MUST have a unique ID.
2. Test case IDs MUST NOT be duplicated.

Recommended format:

```text
TC-001
TC-002
TC-003
```

For module-based projects:

```text
AUTH-TC-001
USER-TC-001
DASH-TC-001
```

---

## 5. TEST CASE FORMAT

Every test case SHOULD contain:

1. S.NO
2. MODULE
3. SUB MODULE
4. USER TYPE
5. FEATURE NO
6. TAB/PAGE
7. FIELDS
8. FEATURE DESCRIPTION
9. TEST CASE NO
10. STEPS TO FOLLOW FOR TESTING
11. EXPECTED RESULT
12. TEST DATA
13. BROWSER
14. ITERATION 1: ACTUAL RESULT
15. ITERATION 1: STATUS
16. DEFECT/REMARKS

Recommended report format:

| S.NO | MODULE | SUB MODULE | USER TYPE | FEATURE NO | TAB/PAGE | FIELDS | FEATURE DESCRIPTION | TEST CASE NO | STEPS TO FOLLOW FOR TESTING | EXPECTED RESULT | TEST DATA | BROWSER | ITERATION 1: ACTUAL RESULT | STATUS | DEFECT/REMARKS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

---

## 6. TEST CASE WRITING RULES

1. Each test case MUST test one clear behavior.
2. Test case descriptions MUST be specific.
3. Steps MUST be written in execution order.
4. Steps MUST be actionable.
5. Expected results MUST be measurable and verifiable.
6. Test data MUST be provided where required.
7. Test cases MUST be independent where possible.
8. Test cases SHOULD be reusable.
9. Avoid vague statements.

Do NOT write:

```text
Check functionality.
Verify page.
Test button.
Check form.
```

Instead, describe the exact behavior being verified.

---

## 7. POSITIVE TESTING

Positive test cases MUST verify valid application behavior.

Examples:

```text
Valid username
Valid email
Valid password
Valid form submission
Valid login
Valid search
Valid file upload
Valid API request
Valid navigation
Valid data update
```

Rules:

1. Use valid test data.
2. Verify successful behavior.
3. Verify correct messages.
4. Verify correct navigation.
5. Verify correct data creation/update/retrieval.

---

## 8. NEGATIVE TESTING

Negative test cases MUST verify invalid or unexpected input.

Examples:

```text
Invalid email
Invalid password
Empty required field
Invalid phone number
Invalid file type
File size exceeding limit
Duplicate record
Unauthorized access
Invalid API request
Non-existent record
Expired session
```

Rules:

1. Invalid input MUST be intentionally tested.
2. Application MUST reject invalid input appropriately.
3. Error messages MUST be verified.
4. Application MUST NOT crash because of invalid input.

---

## 9. BOUNDARY TESTING

Where applicable, test:

1. Minimum allowed value.
2. Maximum allowed value.
3. Below minimum.
4. Above maximum.
5. Minimum string length.
6. Maximum string length.
7. Empty value.
8. Null value.
9. Special characters.
10. Large input values.

Example:

```text
Minimum username length
Maximum username length
One character below minimum
One character above maximum
```

---

## 10. FORM VALIDATION TESTING

For every important form, test:

1. Required fields.
2. Optional fields.
3. Valid input.
4. Invalid input.
5. Empty input.
6. Minimum length.
7. Maximum length.
8. Allowed characters.
9. Special characters.
10. Leading/trailing spaces.
11. Duplicate values.
12. Field dependency.
13. Error messages.
14. Error message placement.
15. Submit behavior.
16. Reset/Clear behavior.
17. Loading state.
18. Successful submission.
19. Failed submission.
20. Duplicate submission prevention.

---

## 11. UI TESTING

UI testing MUST verify:

1. Page loads correctly.
2. Correct page title and heading are displayed.
3. Required components are visible.
4. Buttons are visible and usable.
5. Links navigate correctly.
6. Forms display correctly.
7. Labels are correct.
8. Placeholder text is correct where applicable.
9. Error messages display correctly.
10. Success messages display correctly.
11. Loading indicators work correctly.
12. Empty states display correctly.
13. Modal behavior works correctly.
14. Dropdown behavior works correctly.
15. Search behavior works correctly.
16. Pagination works correctly where applicable.

---

## 12. RESPONSIVE TESTING

Important pages MUST be tested on:

```text
Mobile
Tablet
Desktop
Large Desktop
```

Verify:

1. Layout does not break.
2. Text does not overflow.
3. Buttons remain usable.
4. Forms remain usable.
5. Navigation works.
6. Images scale correctly.
7. Tables have appropriate responsive behavior.
8. Modals fit the screen.
9. Unnecessary horizontal scrolling does not occur.
10. Touch interactions work where applicable.

---

## 13. BROWSER TESTING

Where browser compatibility is required, test supported browsers such as:

```text
Chrome
Edge
Firefox
Safari
```

Rules:

1. Use browsers defined by the project requirements.
2. Record the browser used during execution.
3. Browser-specific failures MUST be recorded.
4. Do NOT assume behavior is identical across browsers.

---

## 14. ACCESSIBILITY TESTING

Test:

1. Keyboard navigation.
2. Tab order.
3. Focus visibility.
4. Form labels.
5. Button accessibility.
6. Image alternative text.
7. Color contrast.
8. Screen-reader relevant labels where applicable.
9. Modal keyboard behavior.
10. Error message accessibility.

Color MUST NOT be the only method used to communicate an error or status.

---

## 15. API TESTING

Where APIs are part of the application, test:

1. Valid request.
2. Invalid request.
3. Missing required fields.
4. Invalid data types.
5. Unauthorized request.
6. Forbidden request.
7. Non-existent resource.
8. Duplicate resource.
9. Server error.
10. Validation error.
11. Response status code.
12. Response structure.
13. Response data.
14. Error response.
15. Authentication behavior.

---

## 16. DATABASE TESTING

Where database functionality is involved, verify:

1. Data is created correctly.
2. Data is retrieved correctly.
3. Data is updated correctly.
4. Data is deleted correctly.
5. Duplicate records are handled.
6. Required database fields are enforced.
7. Invalid data is rejected.
8. Related records behave correctly.
9. Transactions behave correctly where applicable.
10. Data displayed in the UI matches stored data.

---

## 17. AUTHENTICATION TESTING

Test:

1. Valid login.
2. Invalid username/email.
3. Invalid password.
4. Empty credentials.
5. Account lockout where applicable.
6. Logout.
7. Session behavior.
8. Token expiration.
9. Protected page access.
10. Unauthorized access.
11. Password reset where applicable.
12. Remember-me behavior where applicable.

---

## 18. AUTHORIZATION TESTING

Test every applicable user role.

Example:

```text
Admin
Manager
User
Guest
```

Verify:

1. User can access permitted functionality.
2. User cannot access restricted functionality.
3. Restricted API endpoints are protected.
4. Restricted pages are protected.
5. UI controls are appropriate for the user's permissions.
6. Frontend restrictions are not treated as the only security control.

---

## 19. FILE UPLOAD TESTING

If file upload exists, test:

1. Valid file.
2. Invalid file type.
3. Maximum allowed size.
4. File larger than allowed size.
5. Empty upload.
6. Multiple file upload where applicable.
7. Duplicate file where applicable.
8. Special characters in filename.
9. File upload failure.
10. Successful upload.
11. File preview/download where applicable.

---

## 20. SEARCH TESTING

Test:

1. Valid search keyword.
2. Partial keyword.
3. Exact keyword.
4. No matching result.
5. Empty search.
6. Special characters.
7. Uppercase/lowercase behavior.
8. Spaces.
9. Multiple words.
10. Search result accuracy.
11. Search pagination where applicable.
12. Search reset/clear behavior.

---

## 21. PAGINATION TESTING

Test:

1. First page.
2. Last page.
3. Next page.
4. Previous page.
5. Page number selection.
6. Page size selection.
7. Empty result.
8. One-page result.
9. Large dataset.
10. Pagination after filtering/searching.

---

## 22. NAVIGATION TESTING

Verify:

1. Every required menu item works.
2. Links navigate to the correct page.
3. Back navigation works.
4. Browser refresh works where expected.
5. Protected routes are protected.
6. Invalid routes show the correct page.
7. Breadcrumbs work where applicable.
8. Navigation state is correct.
9. Mobile navigation works.

---

## 23. ERROR HANDLING TESTING

Test:

1. Validation errors.
2. Network errors.
3. Server errors.
4. Unauthorized errors.
5. Forbidden errors.
6. Not-found errors.
7. Timeout errors.
8. Empty responses.
9. Unexpected responses.

Verify:

- Application does not crash.
- Meaningful message is displayed.
- Sensitive technical information is not exposed.
- User can recover where appropriate.

---

## 24. REGRESSION TESTING

1. Every bug fix MUST include regression testing.
2. Existing functionality MUST be retested after major changes.
3. Related features MUST be tested after changes.
4. Previously passed test cases SHOULD be rerun when impacted.
5. Regression failures MUST be recorded.

---

## 25. RETESTING RULES

When a defect is fixed:

1. Execute the original failed test case again.
2. Verify the expected result.
3. Perform related regression testing.
4. Update the actual result.
5. Update the status.
6. Record the retest result.
7. A defect MUST NOT be marked fixed without verification.

---

## 26. DEFECT REPORTING RULES

Every defect MUST contain:

1. Defect ID.
2. Module.
3. Feature.
4. Test Case ID.
5. Summary.
6. Steps to reproduce.
7. Expected result.
8. Actual result.
9. Severity.
10. Priority.
11. Environment.
12. Browser/device where applicable.
13. Evidence/screenshot/video where applicable.
14. Defect status.

Recommended statuses:

```text
New
Open
In Progress
Fixed
Ready for Retest
Retest Passed
Reopened
Closed
Rejected
Deferred
```

---

## 27. SEVERITY RULES

Use:

```text
Critical
High
Medium
Low
```

### Critical

Application is unusable or a major business/security function is completely blocked.

### High

Important functionality is broken and there is no reasonable workaround.

### Medium

Functionality is partially affected or a workaround exists.

### Low

Minor UI, text, alignment, cosmetic, or low-impact issue.

Severity MUST be based on actual impact.

---

## 28. TEST STATUS RULES

Use only appropriate statuses:

```text
PASS
FAIL
BLOCKED
NOT EXECUTED
NOT APPLICABLE
```

### PASS

Actual result matches expected result.

### FAIL

Actual result does not match expected result.

### BLOCKED

Testing cannot continue because of an unresolved issue or dependency.

### NOT EXECUTED

The test has not yet been executed.

### NOT APPLICABLE

The test does not apply to the current feature or environment.

A test MUST NOT be marked PASS without verification.

---

## 29. TEST DATA RULES

1. Test data MUST be clearly documented.
2. Positive and negative test data MUST be included.
3. Boundary test data MUST be included where applicable.
4. Sensitive production data MUST NOT be used unnecessarily.
5. Test data SHOULD be reproducible.
6. Data dependencies MUST be documented.
7. Invalid data MUST be intentionally designed to test validation behavior.

---

## 30. TEST EVIDENCE RULES

Where required, capture:

1. Screenshot.
2. Screen recording.
3. API response.
4. Console error.
5. Network error.
6. Relevant logs.
7. Test data.

Evidence SHOULD clearly demonstrate the tested behavior or defect.

---

## 31. TEST REPORT CREATION RULES

The test report MUST be generated after test execution.

The report MUST contain:

1. Project name.
2. Application/module name.
3. Testing scope.
4. Testing environment.
5. Browser/device.
6. Test execution date.
7. Tester.
8. Total test cases.
9. Passed test cases.
10. Failed test cases.
11. Blocked test cases.
12. Not executed test cases.
13. Defect summary.
14. Test case details.
15. Final testing summary.

---

## 32. TEST REPORT FORMAT

The primary test report format MUST be:

| S.NO | MODULE | SUB MODULE | USER TYPE | FEATURE NO | TAB/PAGE | FIELDS | FEATURE DESCRIPTION | TEST CASE NO | STEPS TO FOLLOW FOR TESTING | EXPECTED RESULT | TEST DATA | BROWSER | ITERATION 1: ACTUAL RESULT | STATUS | DEFECT/REMARKS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

Rules:

1. Column names MUST remain consistent.
2. Test Case IDs MUST be unique.
3. Actual Result MUST contain the observed result.
4. Expected Result MUST contain the expected behavior.
5. Status MUST contain the actual execution status.
6. Defect/Remarks MUST contain defect information when applicable.
7. Critical execution information MUST NOT be left blank.

---

## 33. TEST REPORT SUMMARY

The report SHOULD include:

| Metric | Count |
|---|---:|
| Total Test Cases | Actual Count |
| Passed | Actual Count |
| Failed | Actual Count |
| Blocked | Actual Count |
| Not Executed | Actual Count |
| Pass Percentage | Calculated Value |

Rules:

1. Summary values MUST be calculated from actual test results.
2. Do NOT manually invent summary numbers.
3. Pass percentage MUST follow the project's reporting convention.

---

## 34. TEST COVERAGE

The test report SHOULD provide coverage for:

```text
Requirements
Features
Modules
User Types
Functional Scenarios
Validation Scenarios
Negative Scenarios
Boundary Scenarios
UI Scenarios
API Scenarios
Regression Scenarios
```

Every major feature SHOULD have corresponding test coverage.

---

## 35. SCREEN RECORDING RULES

If a screen recording is provided:

1. The recording MUST be reviewed before creating test cases based on it.
2. Test cases MUST reflect functionality demonstrated in the recording.
3. Do NOT invent functionality that is not visible or specified.
4. Important UI fields, buttons, navigation, validation, and behavior shown in the recording SHOULD be captured.
5. The recording SHOULD be used as evidence where appropriate.
6. If observed behavior differs from the requirement, record the observed behavior accurately.

---

## 36. REFERENCE FILE RULES

If reference files are provided:

1. Existing test report formats MUST be inspected.
2. Existing test case formats MUST be followed.
3. Existing validation documents MUST be considered.
4. Existing naming conventions MUST be preserved.
5. New reports MUST maintain the reference report structure unless explicitly requested otherwise.
6. Do NOT remove required columns from an existing format without instruction.

---

## 37. TEST REPORT LANGUAGE RULES

1. Use professional testing terminology.
2. Use clear and concise language.
3. Avoid vague statements.
4. Expected results MUST describe observable behavior.
5. Actual results MUST describe observed behavior.
6. Use consistent terminology.
7. Test steps MUST be understandable to another tester.
8. Do NOT write assumptions as actual results.

---

## 38. CLAUDE-SPECIFIC TESTING RULES

When Claude is asked to create test cases or a test report:

1. Claude MUST inspect all provided requirements and reference files first.
2. Claude MUST inspect the existing test report format if provided.
3. Claude MUST inspect validation rules if provided.
4. Claude MUST inspect screen recordings when provided.
5. Claude MUST derive test cases from actual requirements and observed functionality.
6. Claude MUST NOT invent features.
7. Claude MUST create positive test cases.
8. Claude MUST create negative test cases.
9. Claude MUST create boundary test cases where applicable.
10. Claude MUST include validation scenarios.
11. Claude MUST include user-role scenarios where applicable.
12. Claude MUST include browser/environment information when available.
13. Claude MUST maintain unique test case IDs.
14. Claude MUST preserve the requested test report column structure.
15. Claude MUST record actual results based only on observed execution.
16. Claude MUST NOT fabricate test execution results.
17. Claude MUST NOT mark tests PASS without actual verification.
18. Claude MUST clearly identify assumptions.
19. Claude MUST identify missing information instead of inventing it.
20. Claude MUST calculate test summary values from actual results.
21. Claude MUST include defects for failed test cases where applicable.
22. Claude MUST perform regression/retest analysis when requested.
23. Claude MUST maintain traceability between requirements and test cases.

---

## 39. TEST REPORT DEFINITION OF DONE

Before completing a test report:

- [ ] Requirements reviewed
- [ ] Reference documents reviewed
- [ ] Screen recording reviewed if provided
- [ ] Test scenarios identified
- [ ] Positive test cases created
- [ ] Negative test cases created
- [ ] Boundary test cases created
- [ ] Validation test cases created
- [ ] User-role testing covered
- [ ] UI testing covered
- [ ] API testing covered where applicable
- [ ] Browser testing covered where applicable
- [ ] Responsive testing covered where applicable
- [ ] Test case IDs are unique
- [ ] Test steps are clear
- [ ] Expected results are clear
- [ ] Test data is provided
- [ ] Actual results are based on execution
- [ ] Status is accurate
- [ ] Failed cases have defect/remarks
- [ ] Retesting is recorded where applicable
- [ ] Test summary is calculated from actual results
- [ ] No fabricated results
- [ ] Final report follows the required format

---

# 40. MAIN INSTRUCTION FOR CLAUDE

```text
TESTING ONLY:

Before creating test cases or a test report:

1. Inspect the project requirements.
2. Inspect the application functionality.
3. Inspect all provided reference files.
4. Inspect provided screen recordings.
5. Understand the requested test report format.
6. Identify modules and sub-modules.
7. Identify features and user types.
8. Create positive, negative, validation, and boundary test cases.
9. Execute tests when execution is requested and possible.
10. Record actual results based only on observed behavior.
11. Mark PASS, FAIL, BLOCKED, NOT EXECUTED, or NOT APPLICABLE accurately.
12. Create defects for failed test cases where appropriate.
13. Retest fixed defects when requested.
14. Perform regression testing for impacted functionality.
15. Calculate the final test summary from actual results.
16. Never invent test execution results.
17. Never invent application functionality.
18. Preserve the requested test report format.
19. Maintain complete traceability:
    Requirement → Test Scenario → Test Case → Execution → Result → Defect → Retest.
20. The final test report MUST be accurate, requirement-based,
    executable, traceable, professional, and easy to understand.
```