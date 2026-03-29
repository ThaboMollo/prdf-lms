# PRDF Loan Management System Specification

## 1. Document Overview

### 1.1 Project Name

PRDF Loan Management System

### 1.2 Purpose

This document defines the functional, operational, and technical requirements for the PRDF Loan Management System. It is intended to guide implementation, validation, and deployment across the client UI, admin UI, backend, and data layers.

### 1.3 Background

PRDF requires a system that digitizes the full loan lifecycle. The platform must improve turnaround time for loan processing, strengthen compliance, support document handling, improve reporting, and provide clear visibility into loan and client status.

The system must support both operational staff and management while remaining simple enough to use in contexts involving rural and peri-urban users.

## 2. Product Vision

The PRDF Loan Management System will serve as the central platform for managing the full lending process from client onboarding to repayment tracking. It should reduce manual administration, improve transparency, and create a structured operating model for the organization.

The system should:

- Digitize the end-to-end loan lifecycle
- Improve loan approval turnaround times
- Improve client communication and status visibility
- Strengthen compliance and audit readiness
- Centralize document management
- Provide operational dashboards and management reporting
- Support staff involved in onboarding, review, and loan administration

## 3. Solution Structure

The platform is divided into two primary application surfaces.

### 3.1 Client-Facing Frontend

This is the public or client-accessible side of the platform intended for applicants, borrowers, or assisted onboarding users.

Objectives:

- Allow clients to engage with PRDF digitally
- Simplify application submission and status tracking
- Provide a user-friendly experience for low-friction adoption
- Support guided onboarding for rural and peri-urban users

Core functions:

- View loan product or funding information
- Register a profile or begin an application
- Submit loan applications
- Upload required documents
- Track application status
- Receive notifications and updates
- View repayment information after approval and disbursement
- Access support information where needed

### 3.2 Admin Dashboard

This is the internal platform used by PRDF administrators, loan officers, reviewers, management, and support staff.

Objectives:

- Manage the full internal workflow of loan processing
- Review and assess applications
- Control approvals, disbursements, and repayments
- Maintain compliance-ready records
- Provide dashboards, operational visibility, and reporting

Core functions:

- Manage users and permissions
- View and review submitted applications
- Record assessment outcomes and notes
- Approve, reject, or request more information
- Capture disbursement details
- Track repayments and arrears
- Manage client documents
- Monitor performance metrics and operational reports
- Send or trigger notifications and alerts

## 4. User Roles

### 4.1 Client / Applicant

A person or business representative applying for a loan.

Key permissions:

- Register and log in
- Create and submit an application
- Upload documents
- View own status and repayment information
- Receive updates and notifications

### 4.2 Loan Officer

Internal operational user responsible for reviewing and processing applications.

Key permissions:

- View assigned applications
- Review application details
- Validate documents
- Record internal notes
- Move applications through workflow stages

### 4.3 Approver / Reviewer

A senior user who makes or confirms approval decisions.

Key permissions:

- Review assessed applications
- Approve, reject, or request additional information
- Add comments and decision rationale

### 4.4 Admin

System administrator with platform-wide control.

Key permissions:

- Manage users and roles
- Configure system settings
- Access all applications and reports
- Maintain master data and workflow settings

### 4.5 Management / Reporting User

A stakeholder focused on oversight rather than day-to-day processing.

Key permissions:

- View dashboards
- Access reports
- Monitor turnaround times, loan performance, and repayment trends

### 4.6 Intern / Field Onboarding Support User

Operational support user involved in assisted onboarding.

Key permissions:

- Assist with client capture
- Upload onboarding information
- Track incomplete applications
- Support document collection

## 5. Core Business Process

### 5.1 High-Level Workflow

1. Client begins registration or assisted onboarding
2. Client completes loan application
3. Required supporting documents are uploaded
4. Application is submitted
5. Internal review begins
6. Application is assessed
7. A decision is made: approved, rejected, or sent back for more information
8. If approved, the loan is disbursed
9. Repayment tracking begins
10. Ongoing communication, reminders, and reporting continue throughout the lifecycle

## 6. Functional Requirements

### 6.1 Authentication and Access Control

The system must provide secure access for both client-facing and admin-facing users.

Requirements:

- Users must be able to register and log in securely
- Role-based access control must be enforced
- Client users must only access their own records
- Admin users must access functionality according to role permissions
- Password reset and account recovery must be supported

### 6.2 Client Profile Management

The platform must store and manage client information required for onboarding and lending.

Requirements:

- Create and edit client profiles
- Capture personal or business information
- Store contact details
- Track profile completeness
- Associate multiple documents and applications with a client profile

### 6.3 Loan Application Management

The system must support full loan application capture and management.

Requirements:

- Create new applications
- Save applications as draft
- Submit completed applications
- Capture loan-specific information
- Allow internal users to view full application history
- Track current stage and status

Suggested statuses:

- Draft
- Submitted
- Under Review
- Awaiting Documents
- Assessed
- Approved
- Rejected
- Disbursed
- Active Repayment
- Closed

### 6.4 Document Management

The system must support structured collection and storage of required documents.

Requirements:

- Upload documents from the client UI and admin UI
- Associate documents with a client and application
- Categorize document types
- View and download uploaded files
- Flag missing documents
- Maintain an audit trail of uploads and updates

Example documents:

- Identity document
- Business registration documents
- Bank statements
- Proof of address
- Financial statements
- Supporting application forms

### 6.5 Internal Review and Assessment

The admin dashboard must support structured internal processing of each application.

Requirements:

- Review application details and attached documents
- Record internal comments and findings
- Mark applications as incomplete where necessary
- Request additional information
- Capture assessment outcomes
- Route applications to the next stage in the process

### 6.6 Approval and Decisioning

The system must support formal approval workflows.

Requirements:

- Approvers must be able to approve, reject, or defer applications
- Decision rationale should be recorded
- Approval dates and responsible users should be logged
- Clients must be notified of the outcome where applicable

### 6.7 Disbursement Management

Once approved, the system must support disbursement tracking.

Requirements:

- Capture disbursement amount
- Capture disbursement date
- Record payment reference or notes
- Change application status to disbursed
- Preserve disbursement history for audit purposes

### 6.8 Repayment Tracking

The system must support ongoing repayment monitoring.

Requirements:

- Create a repayment schedule
- Record repayments received
- Show outstanding balance
- Flag overdue repayments
- Display repayment history
- Provide visibility for both clients and internal staff where appropriate

### 6.9 Notifications and Alerts

The system should improve communication and reduce manual follow-up.

Requirements:

- Notify clients when application status changes
- Notify clients when documents are missing
- Notify clients of approval or rejection outcomes
- Send repayment reminders
- Alert internal staff to overdue actions or incomplete items

Possible notification channels:

- Email
- SMS
- WhatsApp integration in a future phase

### 6.10 Dashboard and Reporting

The admin dashboard must provide operational and management reporting.

Requirements:

- Show number of applications by status
- Show approval and rejection counts
- Show disbursement totals
- Show repayment performance
- Show overdue loans or arrears
- Show turnaround time metrics
- Allow export of report data where required

Example dashboard metrics:

- Applications submitted this month
- Applications awaiting review
- Approval rate
- Total disbursed amount
- Active loans
- Loans in arrears
- Average turnaround time

### 6.11 Audit Trail and Compliance

The system must support accountability and audit readiness.

Requirements:

- Record key user actions
- Log status changes
- Log approvals and disbursements
- Log document uploads and edits
- Maintain timestamped history for critical operations

## 7. Non-Functional Requirements

### 7.1 Usability

- The client UI must be simple and easy to navigate
- The interface should support users with limited technical familiarity
- The admin dashboard should favor clarity, workflow speed, and visibility

### 7.2 Performance

- Pages should load quickly under normal operational use
- Application and client searches should return results efficiently
- Dashboard statistics should refresh reliably

### 7.3 Security

- Authentication must be secure
- Sensitive data must be protected
- Access must be restricted by role
- Uploaded documents must be stored securely

### 7.4 Scalability

- The system should support growth in users, applications, and documents over time
- Architecture should allow future integrations and feature expansion

### 7.5 Reliability

- The system should be available during business hours with minimal downtime
- Data loss must be prevented through proper persistence and backup strategy

### 7.6 Maintainability

- The system should be modular and clearly structured
- Features should be easy to extend or replace over time

## 8. Recommended MVP Scope

The minimum viable product should include the following.

### Client-Facing Frontend MVP

- Client registration and login
- Client profile creation
- Loan application form
- Document upload
- Application submission
- Application status tracking
- Notification delivery for major events

### Admin Dashboard MVP

- Admin authentication and role-based access
- Application list and detail view
- Internal review workflow
- Approval and rejection handling
- Document review
- Disbursement capture
- Repayment tracking
- Basic reporting dashboard
- Audit trail for major actions

## 9. Suggested Data Entities

The following entities will likely be required:

- User
- Role
- Client
- LoanApplication
- ApplicationStatusHistory
- Document
- Assessment
- ApprovalDecision
- Disbursement
- RepaymentSchedule
- RepaymentTransaction
- Notification
- AuditLog

## 10. Suggested System Architecture

### 10.1 Frontend Applications

- Client Portal / Frontend
- Admin Dashboard

### 10.2 Backend Services

A shared backend API should serve both the client UI and the admin UI.

### 10.3 Shared Services

- Authentication service
- File storage service
- Notification service
- Reporting service
- Audit logging service

### 10.4 Recommended Architecture Principle

Use one backend domain with clearly separated UI experiences:

- Client UI for external users
- Admin UI for internal users
- Shared core API and database for business logic consistency

## 11. Open Questions for Clarification

The following points should be validated with the client before final implementation:

- Will clients have self-service accounts, or will onboarding be mostly staff-assisted?
- What exact loan products or loan categories must the system support?
- What documents are mandatory per application type?
- What are the final workflow stages and approval rules?
- Who has approval authority and at how many levels?
- Must the system integrate with SMS, email, payment systems, or accounting tools?
- How should repayment data be captured: manual entry, import, or system integration?
- What reports are mandatory for management and compliance?
- Is multilingual support required?
- Are there offline or low-connectivity requirements for field onboarding?

## 12. Delivery Recommendation

The product should be delivered in phases.

### Phase 1: MVP

- Client UI
- Admin dashboard
- Core loan workflow
- Documents
- Notifications
- Basic reports

### Phase 2: Operational Enhancements

- Advanced reporting
- Improved workflow automation
- Better notification integrations
- Enhanced repayment analytics

### Phase 3: Expansion

- Client self-service improvements
- Field onboarding enhancements
- Integration with external systems
- Non-financial support modules

## 13. Final Summary

The PRDF Loan Management System should be designed as a two-part digital platform:

- A client UI for applicants and borrowers
- A secure admin UI for PRDF staff and management

Together, these components should digitize the full loan lifecycle from onboarding to repayment, while improving speed, communication, compliance, visibility, and operational control.

The final system must prioritize clarity, ease of use, structured workflow, and long-term scalability.
