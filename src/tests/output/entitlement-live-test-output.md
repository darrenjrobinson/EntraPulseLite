# EntitlementManagement.Read.All

**Permission type: Delegated, Application**

Allows the app to read access packages and related entitlement management resources on behalf of the signed-in user.

## Available API Methods

- `GET /identityGovernance/entitlementManagement/accessPackageAssignmentApprovals/{accessPackageAssignmentRequestId}`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignmentApprovals/{accessPackageAssignmentRequestId}/stages`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignmentApprovals/{accessPackageAssignmentRequestId}/stages/{approvalStageId}`
- `GET /identityGovernance/entitlementManagement/accessPackages`
- `GET /identityGovernance/entitlementManagement/accessPackages/{accessPackageId}`
- `GET /identityGovernance/entitlementManagement/accessPackages/{id}?$expand=resourceRoleScopes($expand=role,scope)`
- `GET /identityGovernance/entitlementManagement/accessPackages/{id}/accessPackagesIncompatibleWith`
- `GET /identityGovernance/entitlementManagement/accessPackages/{id}/incompatibleAccessPackages`
- `GET /identityGovernance/entitlementManagement/accessPackages/{id}/incompatibleGroups`
- `GET /identityGovernance/entitlementManagement/accessPackages/filterByCurrentUser(on='allowedRequestor')`
- `GET /identityGovernance/entitlementManagement/assignmentPolicies`
- `GET /identityGovernance/entitlementManagement/assignmentPolicies/{accessPackageAssignmentPolicyId}`
- `GET /identityGovernance/entitlementManagement/assignmentRequests`
- `GET /identityGovernance/entitlementManagement/assignmentRequests/{accessPackageAssignmentRequestId}`
- `GET /identityGovernance/entitlementManagement/assignmentRequests/filterByCurrentUser(on='parameterValue')`
- `GET /identityGovernance/entitlementManagement/assignments`
- `GET /identityGovernance/entitlementManagement/assignments/{accessPackageAssignmentId}`
- `GET /identityGovernance/entitlementManagement/assignments/additionalAccess(accessPackageId='parameterValue',incompatibleAccessPackageId='parameterValue')`
- `GET /identityGovernance/entitlementManagement/assignments/filterByCurrentUser(on='parameterValue')`
- `GET /identityGovernance/entitlementManagement/catalogs`
- `GET /identityGovernance/entitlementManagement/catalogs/{accessPackageCatalogId}`
- `GET /identityGovernance/entitlementManagement/catalogs/{catalogId}/customWorkflowExtensions`
- `GET /identityGovernance/entitlementManagement/catalogs/{catalogId}/customWorkflowExtensions/{accessPackageCustomWorkflowExtensionId}`
- `GET /identityGovernance/entitlementManagement/catalogs/{catalogId}/resourceRoles?$filter=(originSystem+eq+%27{originSystemType}%27+and+resource/id+eq+%27{resourceId}%27)&amp;$expand=resource`
- `GET /identityGovernance/entitlementManagement/catalogs/{id}/resources`
- `GET /identityGovernance/entitlementManagement/connectedOrganizations`
- `GET /identityGovernance/entitlementManagement/connectedOrganizations/{connectedOrganizationId}`
- `GET /identityGovernance/entitlementManagement/connectedOrganizations/{id}/externalSponsors`
- `GET /identityGovernance/entitlementManagement/connectedOrganizations/{id}/internalSponsors`
- `GET /identityGovernance/entitlementManagement/resourceRequests`
- `GET /identityGovernance/entitlementManagement/settings`
- `POST /identityGovernance/entitlementManagement/accessPackages/{accessPackageId}/getApplicablePolicyRequirements`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignmentApprovals/{id}`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignmentApprovals/{id}/steps`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignmentApprovals/{id}/steps/{id}`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignmentPolicies`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignmentPolicies/{id}`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignmentRequests`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignmentRequests/{id}`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignmentRequests/filterByCurrentUser(on='parameterValue')`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignmentResourceRoles`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignmentResourceRoles/{id}`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignments`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignments/additionalAccess(accessPackageId='parameterValue',incompatibleAccessPackageId='parameterValue')`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignments/filterByCurrentUser(on='parameterValue')`
- `GET /identityGovernance/entitlementManagement/accessPackageCatalogs`
- `GET /identityGovernance/entitlementManagement/accessPackageCatalogs/{catalogId}/accessPackageCustomWorkflowExtensions`
- `GET /identityGovernance/entitlementManagement/accessPackageCatalogs/{catalogId}/accessPackageCustomWorkflowExtensions/{accessPackageCustomWorkflowExtensionId}`
- `GET /identityGovernance/entitlementManagement/accessPackageCatalogs/{catalogId}/accessPackageResourceRoles?$filter=(originSystem+eq+%27{originSystemType}%27+and+accessPackageResource/id+eq+%27{resourceId}%27)&amp;$expand=accessPackageResource`
- `GET /identityGovernance/entitlementManagement/accessPackageCatalogs/{catalogId}/customAccessPackageWorkflowExtensions`
- `GET /identityGovernance/entitlementManagement/accessPackageCatalogs/{catalogId}/customAccessPackageWorkflowExtensions/{customAccessPackageWorkflowExtensionId}`
- `GET /identityGovernance/entitlementManagement/accessPackageCatalogs/{id}`
- `GET /identityGovernance/entitlementManagement/accessPackageCatalogs/{id}/accessPackageResources`
- `GET /identityGovernance/entitlementManagement/accessPackageResourceEnvironments/{accessPackageResourceEnvironmentId}`
- `GET /identityGovernance/entitlementManagement/accessPackageResourceRequests`
- `GET /identityGovernance/entitlementManagement/accessPackages/{id}`
- `GET /identityGovernance/entitlementManagement/accessPackages/{id}?$expand=accessPackageResourceRoleScopes($expand=accessPackageResourceRole,accessPackageResourceScope)`
- `GET /identityGovernance/entitlementManagement/connectedOrganizations/{id}`
- `POST /identityGovernance/entitlementManagement/accessPackageCatalogs/{catalogId}/accessPackageCustomWorkflowExtensions`
- `POST /identityGovernance/entitlementManagement/accessPackages/{id}/getApplicablePolicyRequirements`
- `GET /roleManagement/directory/roleAssignments`
- `GET /roleManagement/directory/roleAssignments/{id}`
- `GET /roleManagement/directory/roleDefinitions`
- `GET /roleManagement/directory/roleDefinitions/{id}`
- `GET /roleManagement/cloudPC/roleDefinitions`
- `GET /roleManagement/cloudPC/roleDefinitions/{id}`
- `GET /identityGovernance/entitlementManagement/accessPackages/filterByCurrentUser`
- `GET /identityGovernance/entitlementManagement/assignmentRequests/filterByCurrentUser`
- `GET /identityGovernance/entitlementManagement/assignments/additionalAccess`
- `GET /identityGovernance/entitlementManagement/assignments/filterByCurrentUser`
- `GET /identityGovernance/entitlementManagement/catalogs/{catalogId}/resourceRoles`
- `GET /identityGovernance/entitlementManagement/accessPackages/{accessPackageId}/getApplicablePolicyRequirements`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignmentRequests/filterByCurrentUser`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignments/additionalAccess`
- `GET /identityGovernance/entitlementManagement/accessPackageAssignments/filterByCurrentUser`
- `GET /identityGovernance/entitlementManagement/accessPackageCatalogs/{catalogId}/accessPackageResourceRoles`
- `GET /identityGovernance/entitlementManagement/accessPackages/{id}/getApplicablePolicyRequirements`

## Resources

### accessPackage

| Property | Type | Description |
| --- | --- | --- |
| `createdDateTime` | DateTimeOffset | The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . Read-only. |
| `description` | String | The description of the access package. |
| `displayName` | String | Required. The display name of the access package. Supports $filter ( eq , contains ). |
| `id` | String | Read-only. |
| `isHidden` | Boolean | Indicates whether the access package is hidden from the requestor. |
| `modifiedDateTime` | DateTimeOffset | The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . Read-only. |

### accessPackageAssignment

| Property | Type | Description |
| --- | --- | --- |
| `customExtensionCalloutInstances` | customExtensionCalloutInstance collection | Information about all the custom extension calls that were made during the access package assignment workflow. |
| `expiredDateTime` | DateTimeOffset | The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . Read-only. |
| `id` | String | Read-only. |
| `schedule` | entitlementManagementSchedule | When the access assignment is to be in place. Read-only. |
| `state` | accessPackageAssignmentState | The state of the access package assignment. The possible values are: delivering , partiallyDelivered , delivered , expired , deliveryFailed , unknownFutureValue . Read-only. Supports $filter ( eq ). |
| `status` | String | More information about the assignment lifecycle. Possible values include Delivering , Delivered , NearExpiry1DayNotificationTriggered , or ExpiredNotificationTriggered . Read-only. |

### accesspackageassignment-accesspackageassignmentfilterbycurrentuseroptions

| Property | Type | Description |
| --- | --- | --- |
| `allowedTargetScope` | allowedTargetScope | Principals that can be assigned the access package through this policy. The possible values are: notSpecified , specificDirectoryUsers , specificConnectedOrganizationUsers , specificDirectoryServicePrincipals , allMemberUsers , allDirectoryUsers , allDirectoryServicePrincipals , allConfiguredConnectedOrganizationUsers , allExternalUsers , unknownFutureValue . |
| `automaticRequestSettings` | accessPackageAutomaticRequestSettings | This property is only present for an auto assignment policy; if absent, this is a request-based policy. |
| `createdDateTime` | DateTimeOffset | The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . |
| `description` | String | The description of the policy. |
| `displayName` | String | The display name of the policy. |
| `expiration` | expirationPattern | The expiration date for assignments created in this policy. |
| `id` | String | Read only. |
| `modifiedDateTime` | DateTimeOffset | The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . |
| `accessPackageNotificationSettings` | accessPackageNotificationSettings | Represents the settings for email notifications for requests to an access package. |
| `requestApprovalSettings` | accessPackageAssignmentApprovalSettings | Specifies the settings for approval of requests for an access package assignment through this policy. For example, if approval is required for new requests. |
| `requestorSettings` | accessPackageAssignmentRequestorSettings | Provides additional settings to select who can create a request for an access package assignment through this policy, and what they can include in their request. |
| `reviewSettings` | accessPackageAssignmentReviewSettings | Settings for access reviews of assignments through this policy. |
| `specificAllowedTargets` | subjectSet collection | The principals that can be assigned access from an access package through this policy. |

### accessPackageAssignmentPolicy

| Property | Type | Description |
| --- | --- | --- |
| `allowedTargetScope` | allowedTargetScope | Principals that can be assigned the access package through this policy. The possible values are: notSpecified , specificDirectoryUsers , specificConnectedOrganizationUsers , specificDirectoryServicePrincipals , allMemberUsers , allDirectoryUsers , allDirectoryServicePrincipals , allConfiguredConnectedOrganizationUsers , allExternalUsers , unknownFutureValue . |
| `automaticRequestSettings` | accessPackageAutomaticRequestSettings | This property is only present for an auto assignment policy; if absent, this is a request-based policy. |
| `createdDateTime` | DateTimeOffset | The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . |
| `description` | String | The description of the policy. |
| `displayName` | String | The display name of the policy. |
| `expiration` | expirationPattern | The expiration date for assignments created in this policy. |
| `id` | String | Read only. |
| `modifiedDateTime` | DateTimeOffset | The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . |
| `accessPackageNotificationSettings` | accessPackageNotificationSettings | Represents the settings for email notifications for requests to an access package. |
| `requestApprovalSettings` | accessPackageAssignmentApprovalSettings | Specifies the settings for approval of requests for an access package assignment through this policy. For example, if approval is required for new requests. |
| `requestorSettings` | accessPackageAssignmentRequestorSettings | Provides additional settings to select who can create a request for an access package assignment through this policy, and what they can include in their request. |
| `reviewSettings` | accessPackageAssignmentReviewSettings | Settings for access reviews of assignments through this policy. |
| `specificAllowedTargets` | subjectSet collection | The principals that can be assigned access from an access package through this policy. |

### accessPackageAssignmentRequest

| Property | Type | Description |
| --- | --- | --- |
| `answers` | accessPackageAnswer collection | Answers provided by the requestor to accessPackageQuestions asked of them at the time of request. |
| `completedDateTime` | DateTimeOffset | The date of the end of processing, either successful or failure, of a request. The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . Read-only. |
| `customExtensionCalloutInstances` | customExtensionCalloutInstance collection | Information about all the custom extension calls that were made during the access package assignment workflow. |
| `createdDateTime` | DateTimeOffset | The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . Read-only. Supports $filter . |
| `id` | String | Read-only. |
| `justification` | String | The requestor's supplied justification. |
| `requestType` | accessPackageRequestType | The type of the request. The possible values are: notSpecified , userAdd , UserExtend , userUpdate , userRemove , adminAdd , adminUpdate , adminRemove , systemAdd , systemUpdate , systemRemove , onBehalfAdd (not supported), unknownFutureValue . Requests from the user have a requestType of userAdd , userUpdate , or userRemove . This property can't be changed once set. |
| `schedule` | entitlementManagementSchedule | The range of dates that access is to be assigned to the requestor. This property can't be changed once set, but a new schedule for an assignment can be included in another userUpdate or UserExtend or adminUpdate assignment request. |
| `state` | accessPackageRequestState | The state of the request. The possible values are: submitted , pendingApproval , delivering , delivered , deliveryFailed , denied , scheduled , canceled , partiallyDelivered , unknownFutureValue . Read-only. Supports $filter ( eq ). |
| `status` | String | More information on the request processing status. Read-only. |

### accesspackageassignmentrequest-accesspackageassignmentrequestfilterbycurrentuseroptions

| Property | Type | Description |
| --- | --- | --- |
| `allowCustomAssignmentSchedule` | Boolean | Indicates whether the requestor is allowed to set a custom schedule. |
| `isApprovalRequiredForAdd` | Boolean | Indicates whether a request to add must be approved by an approver. |
| `isApprovalRequiredForUpdate` | Boolean | Indicates whether a request to update must be approved by an approver. |
| `isRequestorJustificationRequired` | Boolean | Indicates whether requestors must justify requesting access to an access package. |
| `policyDescription` | String | The description of the policy that the user is trying to request access using. |
| `policyDisplayName` | String | The display name of the policy that the user is trying to request access using. |
| `policyId` | String | The identifier of the policy that these requirements are associated with. This identifier can be used when creating a new assignment request. |
| `questions` | accessPackageQuestion collection | Questions that are configured on the policy. The questions can be required or optional; callers can determine whether a question is required or optional based on the isRequired property on accessPackageQuestion . |
| `schedule` | entitlementManagementSchedule | Schedule restrictions enforced, if any. |

### accessPackageAssignmentRequestRequirements

| Property | Type | Description |
| --- | --- | --- |
| `allowCustomAssignmentSchedule` | Boolean | Indicates whether the requestor is allowed to set a custom schedule. |
| `isApprovalRequiredForAdd` | Boolean | Indicates whether a request to add must be approved by an approver. |
| `isApprovalRequiredForUpdate` | Boolean | Indicates whether a request to update must be approved by an approver. |
| `isRequestorJustificationRequired` | Boolean | Indicates whether requestors must justify requesting access to an access package. |
| `policyDescription` | String | The description of the policy that the user is trying to request access using. |
| `policyDisplayName` | String | The display name of the policy that the user is trying to request access using. |
| `policyId` | String | The identifier of the policy that these requirements are associated with. This identifier can be used when creating a new assignment request. |
| `questions` | accessPackageQuestion collection | Questions that are configured on the policy. The questions can be required or optional; callers can determine whether a question is required or optional based on the isRequired property on accessPackageQuestion . |
| `schedule` | entitlementManagementSchedule | Schedule restrictions enforced, if any. |

### accessPackageAssignmentRequestWorkflowExtension

| Property | Type | Description |
| --- | --- | --- |
| `authenticationConfiguration` | customExtensionAuthenticationConfiguration | Configuration for securing the API call to the logic app. For example, using OAuth client credentials flow. Inherited from customCalloutExtension. |
| `callbackConfiguration` | customExtensionCallbackConfiguration | The callback configuration for a custom extension. |
| `clientConfiguration` | customExtensionClientConfiguration | HTTP connection settings that define how long Microsoft Entra ID can wait for a connection to a logic app, how many times you can retry a timed-out connection and the exception scenarios when retries are allowed. Inherited from customCalloutExtension. |
| `createdBy` | String | The userPrincipalName of the user or identity of the subject that created this resource. Read-only. |
| `createdDateTime` | DateTimeOffset | When the object was created. |
| `description` | String | Description for the customAccessPackageWorkflowExtension object. Inherited from customCalloutExtension. |
| `displayName` | String | Display name for the customAccessPackageWorkflowExtension object. Inherited from customCalloutExtension. |
| `endpointConfiguration` | customExtensionEndpointConfiguration | The type and details for configuring the endpoint to call the logic app's workflow. Inherited from customCalloutExtension. |
| `id` | String | Read-only. |
| `lastModifiedBy` | String | The userPrincipalName of the identity that last modified the object. |
| `lastModifiedDateTime` | DateTimeOffset | When the object was last modified. |

### accessPackageAssignmentResourceRole

| Property | Type | Description |
| --- | --- | --- |
| `id` | String | Read-only. |
| `originId` | String | A unique identifier relative to the origin system, corresponding to the originId property of the accessPackageResourceRole. |
| `originSystem` | String | The system where the role assignment is to be created or has been created for an access package assignment, such as SharePointOnline , AadGroup , or AadApplication , corresponding to the originSystem property of the accessPackageResourceRole. |
| `status` | String | The value is PendingFulfillment before the access package assignment is delivered to the origin system, and Fulfilled after the access package assignment is delivered to the origin system. |

### accessPackageAssignmentWorkflowExtension

| Property | Type | Description |
| --- | --- | --- |
| `authenticationConfiguration` | customExtensionAuthenticationConfiguration | Configuration for securing the API call to the logic app. For example, using OAuth client credentials flow. Inherited from customCalloutExtension. |
| `callbackConfiguration` | customExtensionCallbackConfiguration | The callback configuration for a custom extension. |
| `clientConfiguration` | customExtensionClientConfiguration | HTTP connection settings that define how long Microsoft Entra ID can wait for a connection to a logic app. The settings define how many times you can retry a timed-out connection and the exception scenarios when retries are allowed. Inherited from customCalloutExtension. |
| `createdBy` | String | The userPrincipalName of the user or identity of the subject that created this resource. Read-only. |
| `createdDateTime` | DateTimeOffset | When the entity was created. |
| `description` | String | Description for the customAccessPackageWorkflowExtension object. Inherited from customCalloutExtension. |
| `displayName` | String | Display name for the customAccessPackageWorkflowExtension object. Inherited from customCalloutExtension. |
| `endpointConfiguration` | customExtensionEndpointConfiguration | The type and details for configuring the endpoint to call the logic app's workflow. Inherited from customCalloutExtension. |
| `id` | String | Read-only. |
| `lastModifiedBy` | String | The userPrincipalName of the identity that last modified the entity. |
| `lastModifiedDateTime` | DateTimeOffset | When the entity was last modified. |

### accessPackageCatalog

| Property | Type | Description |
| --- | --- | --- |
| `catalogType` | accessPackageCatalogType | Whether the catalog is created by a user or entitlement management. The possible values are: userManaged , serviceDefault , serviceManaged , unknownFutureValue . |
| `createdDateTime` | DateTimeOffset | The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . Read-only. |
| `description` | String | The description of the access package catalog. |
| `displayName` | String | The display name of the access package catalog. |
| `id` | String | Read-only. |
| `isExternallyVisible` | Boolean | Whether the access packages in this catalog can be requested by users outside of the tenant. |
| `modifiedDateTime` | DateTimeOffset | The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . Read-only. |
| `state` | accessPackageCatalogState | Has the value published if the access packages are available for management. The possible values are: unpublished , published , unknownFutureValue . |

### accessPackageResource

| Property | Type | Description |
| --- | --- | --- |
| `attributes` | accessPackageResourceAttribute collection | Contains information about the attributes to be collected from the requestor and sent to the resource application. |
| `createdDateTime` | DateTimeOffset | The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . Read-only. |
| `description` | String | A description for the resource. |
| `displayName` | String | The display name of the resource, such as the application name, group name or site name. |
| `id` | String | Read-only. |
| `modifiedDateTime` | DateTimeOffset | The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . Read-only. |
| `originId` | String | The unique identifier of the resource in the origin system. For a Microsoft Entra group, this is the identifier of the group. |
| `originSystem` | String | The type of the resource in the origin system, such as SharePointOnline , AadApplication or AadGroup . |

### accessPackageResourceEnvironment

| Property | Type | Description |
| --- | --- | --- |
| `connectionInfo` | connectionInfo | Connection information of an environment used to connect to a resource. |
| `createdDateTime` | DateTimeOffset | The date and time that this object was created. The DateTimeOffset type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . |
| `description` | String | The description of this object. |
| `displayName` | String | The display name of this object. |
| `id` | String | The system-assigned unique identifier of the object. |
| `isDefaultEnvironment` | Boolean | Determines whether this is default environment or not. It is set to true for all static origin systems, such as Microsoft Entra groups and Microsoft Entra Applications. |
| `modifiedDateTime` | DateTimeOffset | The date and time that this object was last modified. The DateTimeOffset type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . |
| `originId` | String | The unique identifier of this environment in the origin system. |
| `originSystem` | String | The type of the resource in the origin system, that is, SharePointOnline . Requires $filter ( eq ). |

### accessPackageResourceRequest

| Property | Type | Description |
| --- | --- | --- |
| `createdDateTime` | DateTimeOffset | The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . Read-only. |
| `id` | String | Read-only. |
| `requestType` | accessPackageRequestType | The type of the request. Use adminAdd to add a resource, if the caller is an administrator or resource owner, adminUpdate to update a resource, or adminRemove to remove a resource. |
| `state` | accessPackageRequestState | The outcome of whether the service was able to add the resource to the catalog. The value is delivered if the resource was added or removed, and deliveryFailed if it couldn't be added or removed. Read-only. |

### accessPackageResourceRole

| Property | Type | Description |
| --- | --- | --- |
| `description` | String | A description for the resource role. |
| `displayName` | String | The display name of the resource role such as the role defined by the application. |
| `id` | String | Read-only. |
| `originId` | String | The unique identifier of the resource role in the origin system. For a SharePoint Online site, the originId is the sequence number of the role in the site. |
| `originSystem` | String | The type of the resource in the origin system, such as SharePointOnline , AadApplication , or AadGroup . |

### accessPackageResourceRoleScope

| Property | Type | Description |
| --- | --- | --- |
| `createdDateTime` | DateTimeOffset | The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z |
| `id` | String | Read-only. |

### accessPackageResourceScope

| Property | Type | Description |
| --- | --- | --- |
| `description` | String | The description of the scope. |
| `displayName` | String | The display name of the scope. |
| `id` | String | Read-only. |
| `isRootScope` | Boolean | True if the scopes are arranged in a hierarchy and this is the top or root scope of the resource. |
| `originId` | String | The unique identifier for the scope in the resource as defined in the origin system. |
| `originSystem` | String | The origin system for the scope. |

### approval

| Property | Type | Description |
| --- | --- | --- |
| `id` | String | Identifier of the approval decision. In PIM for groups, it's the same identifier as the identifier of the assignment schedule request. |

### approvalStage

| Property | Type | Description |
| --- | --- | --- |
| `assignedToMe` | Boolean | Indicates whether the stage is assigned to the calling user to review. Read-only. |
| `displayName` | String | The label provided by the policy creator to identify an approval stage. Read-only. |
| `id` | String | The identifier of the stage associated with an approval object. Read-only. |
| `justification` | String | The justification associated with the approval stage decision. |
| `reviewResult` | String | The result of this approval record. Possible values include: NotReviewed , Approved , Denied . |
| `reviewedBy` | identity | The identifier of the reviewer. 00000000-0000-0000-0000-000000000000 if the assigned reviewer hasn't reviewed. Read-only. |
| `reviewedDateTime` | DateTimeOffset | The date and time when a decision was recorded. The date and time information uses ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . Read-only. |
| `status` | String | The stage status. Possible values: InProgress , Initializing , Completed , Expired . Read-only. |

### approvalStep

| Property | Type | Description |
| --- | --- | --- |
| `assignedToMe` | Boolean | Indicates whether the step is assigned to the calling user to review. Read-only. |
| `displayName` | String | The label provided by the policy creator to identify an approval step. Read-only. |
| `id` | String | The identifier of the step associated with an approval object. Read-only. |
| `justification` | String | The justification associated with the approval step decision. |
| `reviewResult` | String | The result of this approval record. Possible values include: NotReviewed , Approved , Denied . |
| `reviewedBy` | userIdentity collection | The identifier of the reviewer. 00000000-0000-0000-0000-000000000000 if the assigned reviewer hasn't reviewed. Read-only. |
| `reviewedDateTime` | DateTimeOffset | The date and time when a decision was recorded. The date and time information uses ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . Read-only. |
| `status` | String | The step status. Possible values: InProgress , Initializing , Completed , Expired . Read-only. |

### connectedOrganization

| Property | Type | Description |
| --- | --- | --- |
| `createdDateTime` | DateTimeOffset | The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . Read-only. |
| `description` | String | The description of the connected organization. |
| `displayName` | String | The display name of the connected organization. Supports $filter ( eq ). |
| `id` | String | Read-only. |
| `identitySources` | identitySource collection | The identity sources in this connected organization, one of azureActiveDirectoryTenant, crossCloudAzureActiveDirectoryTenant, domainIdentitySource, externalDomainFederation, or socialIdentitySource. Nullable. |
| `modifiedDateTime` | DateTimeOffset | *The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . Read-only. |
| `state` | connectedOrganizationState | The state of a connected organization defines whether assignment policies with requestor scope type AllConfiguredConnectedOrganizationSubjects are applicable or not. The possible values are: configured , proposed , unknownFutureValue . |

### customaccesspackageworkflowextension

| Property | Type | Description |
| --- | --- | --- |
| `authenticationConfiguration` | customExtensionAuthenticationConfiguration | Configuration for securing the API call to the logic app. For example, using OAuth client credentials flow. Inherited from customCalloutExtension. |
| `clientConfiguration` | customExtensionClientConfiguration | HTTP connection settings that define how long Microsoft Entra ID can wait for a connection to a logic app, how many times you can retry a timed-out connection and the exception scenarios when retries are allowed. Inherited from customCalloutExtension. |
| `createdDateTime` | DateTimeOffset | Represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . Read-only. |
| `description` | String | Description for the customAccessPackageWorkflowExtension object. Inherited from customCalloutExtension. Read only. |
| `displayName` | String | Display name for the customAccessPackageWorkflowExtension object. Inherited from customCalloutExtension. Read only. Supports $filter ( contains ). |
| `endpointConfiguration` | customExtensionEndpointConfiguration | The type and details for configuring the endpoint to call the logic app's workflow. Inherited from customCalloutExtension. |
| `id` | String | Identifier for the customAccessPackageWorkflowExtension object. Inherited from entity. |
| `lastModifiedDateTime` | DateTimeOffset | Represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z . Read-only. |

### customExtensionAuthenticationConfiguration

| Property | Type | Description |
| --- | --- | --- |
| `timeoutDuration` | Duration | The maximum duration in ISO 8601 format that Microsoft Entra ID will wait for a resume action for the callout it sent to the logic app. The valid range for custom extensions in lifecycle workflows is five minutes to three hours. The valid range for custom extensions in entitlement management is between 5 minutes and 14 days. For example, PT3H refers to three hours, P3D refers to three days, PT10M refers to ten minutes. |

### customExtensionCallbackConfiguration

| Property | Type | Description |
| --- | --- | --- |
| `timeoutDuration` | Duration | The maximum duration in ISO 8601 format that Microsoft Entra ID will wait for a resume action for the callout it sent to the logic app. The valid range for custom extensions in lifecycle workflows is five minutes to three hours. The valid range for custom extensions in entitlement management is between 5 minutes and 14 days. For example, PT3H refers to three hours, P3D refers to three days, PT10M refers to ten minutes. |

### customExtensionEndpointConfiguration

| Property | Type | Description |
| --- | --- | --- |
| `deletedDateTime` | DateTimeOffset | Date and time when this object was deleted. Always null when the object hasn't been deleted. |
| `id` | String | The unique identifier for the object. For example, 12345678-9abc-def0-1234-56789abcde . The value of the **i |

### directoryObject

| Property | Type | Description |
| --- | --- | --- |
| `deletedDateTime` | DateTimeOffset | Date and time when this object was deleted. Always null when the object hasn't been deleted. |
| `id` | String | The unique identifier for the object. For example, 12345678-9abc-def0-1234-56789abcde . The value of the **i |

### entitlementmanagement-overview

| Property | Type | Description |
| --- | --- | --- |
| `durationUntilExternalUserDeletedAfterBlocked` | Duration | If externalUserLifecycleAction is blockSignInAndDelete , the duration, typically many days, after an external user is blocked from sign in before their account is deleted. |
| `externalUserLifecycleAction` | accessPackageExternalUserLifecycleAction | Automatic action that the service should take when an external user's last access package assignment is removed. The possible values are: none , blockSignIn , blockSignInAndDelete , unknownFutureValue . |
| `id` | String | A constant. Read-only. |

### entitlementManagementSettings

| Property | Type | Description |
| --- | --- | --- |
| `durationUntilExternalUserDeletedAfterBlocked` | Duration | If externalUserLifecycleAction is blockSignInAndDelete , the duration, typically many days, after an external user is blocked from sign in before their account is deleted. |
| `externalUserLifecycleAction` | accessPackageExternalUserLifecycleAction | Automatic action that the service should take when an external user's last access package assignment is removed. The possible values are: none , blockSignIn , blockSignInAndDelete , unknownFutureValue . |
| `id` | String | A constant. Read-only. |

### externalSponsors

| Property | Type | Description |
| --- | --- | --- |
| `allowExternalSenders` | Boolean | Indicates if people external to the organization can send messages to the group. The default value is false . Returned only on $select . Supported only on the Get group API ( GET /groups/{ID} ). |
| `assignedLabels` | assignedLabel collection | The list of sensitivity label pairs (label ID, label name) associated with a Microsoft 365 group. Returned only on $select . This property can be updated only in delegated scenarios where the caller requires both the Microsoft Graph permission and a supported administrator role. |
| `assignedLicenses` | assignedLicense collection | The licenses that are assigned to the group. Returned only on $select . Supports $filter ( eq ). Read-only. |
| `autoSubscribeNewMembers` | Boolean | Indicates if new members added to the group are autosubscribed to receive email notifications. You can set this property in a PATCH request for the group; don't set it in the initial POST request that creates the group. Default value is false . Returned only on $select . Supported only on the Get group API ( GET /groups/{ID} ). |
| `classification` | String | Describes a classification for the group (such as low, medium, or high business impact). Valid values for this property are defined by creating a ClassificationList setting value, based on the template definition. Returned by default. Supports $filter ( eq , ne , not , ge , le , startsWith ). |
| `createdDateTime` | DateTimeOffset | Timestamp of when the group was created. The value can't be modified and is automatically populated when the group is created. The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on January 1, 2014 is 2014-01-01T00:00:00Z . Returned by default. Read-only. |
| `deletedDateTime` | DateTimeOffset | For some Microsoft Entra objects (user, group, application), if the object is deleted, it's first logically deleted, and this property is updated with the date and time when the object was deleted. Otherwise this property is null . If the object is restored, this property is updated to null . Inherited from directoryObject. |
| `description` | String | An optional description for the group. Returned by default. Supports $filter ( eq , ne , not , ge , le , startsWith ) and $search . |
| `displayName` | String | The display name for the group. This property is required when a group is created and can't be cleared during updates. Maximum length is 256 characters. Returned by default. Supports $filter ( eq , ne , not , ge , le , in , startsWith , and eq on null values), $search , and $orderby . |
| `expirationDateTime` | DateTimeOffset | Timestamp of when the group is set to expire. It's null for security groups, but for Microsoft 365 groups, it represents when the group is set to expire as defined in the groupLifecyclePolicy. The Timestamp type represents date and time information using ISO 8601 format and is always in UTC. For example, midnight UTC on January 1, 2014 is 2014-01-01T00:00:00Z . Returned by default. Supports $filter ( eq , ne , not , ge , le , in ). Read-only. |
| `groupTypes` | String collection | Specifies the group type and its membership. If the collection contains Unified , the group is a Microsoft 365 group; otherwise, it's either a security group or a distribution group. For details, see groups overview. If the collection includes DynamicMembership , the group has dynamic membership; otherwise, membership is static. Returned by default. Supports $filter ( eq , not ). |
| `hasMembersWithLicenseErrors` | Boolean | Indicates whether there are members in this group that have license errors from its group-based license assignment. This property is never returned on a GET operation. You can use it as a $filter argument to get groups that have members with license errors (that is, filter for this property being true). See an example. Supports $filter ( eq ). |
| `hideFromAddressLists` | Boolean | True if the group isn't displayed in certain parts of the Outlook UI: the Address Book , address lists for selecting message recipients, and the Browse Groups dialog for searching groups; otherwise, false. The default value is false . Returned only on $select . Supported only on the Get group API ( GET /groups/{ID} ). |
| `hideFromOutlookClients` | Boolean | True if the group isn't displayed in Outlook clients, such as Outlook for Windows and Outlook on the web; otherwise, false. The default value is false . Returned only on $select . Supported only on the Get group API ( GET /groups/{ID} ). |
| `id` | String | The unique identifier for the group. Returned by default. Inherited from directoryObject. Key. Not nullable. Read-only. Supports $filter ( eq , ne , not , in ). |
| `isArchived` | Boolean | When a group is associated with a team, this property determines whether the team is in read-only mode. To read this property, use the /group/{groupId}/team endpoint or the Get team API. To update this property, use the archiveTeam and unarchiveTeam APIs. |
| `isAssignableToRole` | Boolean | Indicates whether this group can be assigned to a Microsoft Entra role. Optional. This property can only be set while creating the group and is immutable. If set to true , the securityEnabled property must also be set to true , visibility must be Hidden , and the group can't be a dynamic group (that is, groupTypes can't contain DynamicMembership ). Only callers with at least the Privileged Role Administrator role can set this property. The caller must also be assigned the RoleManagement.ReadWrite.Directory permission to set this property or update the membership of such groups. For more, see Using a group to manage Microsoft Entra role assignments Using this feature requires a Microsoft Entra ID P1 license. Returned by default. Supports $filter ( eq , ne , not ). |
| `isSubscribedByMail` | Boolean | Indicates whether the signed-in user is subscribed to receive email conversations. The default value is true . Returned only on $select . Supported only on the Get group API ( GET /groups/{ID} ). |
| `licenseProcessingState` | String | Indicates the status of the group license assignment to all group members. The default value is false . Read-only. Possible values: QueuedForProcessing , ProcessingInProgress , and ProcessingComplete . Returned only on $select . Read-only. |
| `mail` | String | The SMTP address for the group, for example, &quot; [email&#160;protected] &quot;. Returned by default. Read-only. Supports $filter ( eq , ne , not , ge , le , in , startsWith , and eq on null values). |
| `mailEnabled` | Boolean | Specifies whether the group is mail-enabled. Required. Returned by default. Supports $filter ( eq , ne , not ). |
| `mailNickname` | String | The mail alias for the group, unique for Microsoft 365 groups in the organization. Maximum length is 64 characters. This property can contain only characters in the ASCII character set 0 - 127 except the following characters: @ () \ [] &quot; ; : &lt;&gt; , SPACE . Required. Returned by default. Supports $filter ( eq , ne , not , ge , le , in , startsWith , and eq on null values). |
| `membershipRule` | String | The rule that determines members for this group if the group is a dynamic group (groupTypes contains DynamicMembership ). For more information about the syntax of the membership rule, see Membership Rules syntax. Returned by default. Supports $filter ( eq , ne , not , ge , le , startsWith ). |
| `membershipRuleProcessingState` | String | Indicates whether the dynamic membership processing is on or paused. Possible values are On or Paused . Returned by default. Supports $filter ( eq , ne , not , in ). |
| `onPremisesDomainName` | String | Contains the on-premises domain FQDN , also called dnsDomainName synchronized from the on-premises directory. The property is only populated for customers synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Returned by default. Read-only. |
| `onPremisesLastSyncDateTime` | DateTimeOffset | Indicates the last time at which the group was synced with the on-premises directory. The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on January 1, 2014 is 2014-01-01T00:00:00Z . Returned by default. Read-only. Supports $filter ( eq , ne , not , ge , le , in ). |
| `onPremisesNetBiosName` | String | Contains the on-premises netBios name synchronized from the on-premises directory. The property is only populated for customers synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Returned by default. Read-only. |
| `onPremisesProvisioningErrors` | onPremisesProvisioningError collection | Errors when using Microsoft synchronization product during provisioning. Returned by default. Supports $filter ( eq , not ). |
| `onPremisesSamAccountName` | String | Contains the on-premises SAM account name synchronized from the on-premises directory. The property is only populated for customers synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Returned by default. Supports $filter ( eq , ne , not , ge , le , in , startsWith ). Read-only. |
| `onPremisesSecurityIdentifier` | String | Contains the on-premises security identifier (SID) for the group synchronized from on-premises to the cloud. Read-only. Returned by default. Supports $filter ( eq including on null values). |
| `onPremisesSyncEnabled` | Boolean | true if this group is synced from an on-premises directory; false if this group was originally synced from an on-premises directory but is no longer synced; null if this object has never synced from an on-premises directory (default). Returned by default. Read-only. Supports $filter ( eq , ne , not , in , and eq on null values). |
| `preferredDataLocation` | String | The preferred data location for the Microsoft 365 group. By default, the group inherits the group creator's preferred data location. To set this property, the calling app must be granted the Directory.ReadWrite.All permission and the user be assigned at least one of the following Microsoft Entra roles: User Account Administrator Directory Writer Exchange Administrator SharePoint Administrator For more information about this property, see OneDrive Online Multi-Geo. Nullable. Returned by default. |
| `preferredLanguage` | String | The preferred language for a Microsoft 365 group. Should follow ISO 639-1 Code; for example, en-US . Returned by default. Supports $filter ( eq , ne , not , ge , le , in , startsWith , and eq on null values). |
| `proxyAddresses` | String collection | Email addresses for the group that direct to the same group mailbox. For example: [&quot;SMTP: [email&#160;protected] &quot;, &quot;smtp: [email&#160;protected] &quot;] . The any operator is required to filter expressions on multi-valued properties. Returned by default. Read-only. Not nullable. Supports $filter ( eq , not , ge , le , startsWith , endsWith , /$count eq 0 , /$count ne 0 ). |
| `renewedDateTime` | DateTimeOffset | Timestamp of when the group was last renewed. This value can't be modified directly and is only updated via the renew service action. The Timestamp type represents date and time information using ISO 8601 format and is always in UTC. For example, midnight UTC on January 1, 2014 is 2014-01-01T00:00:00Z . Returned by default. Supports $filter ( eq , ne , not , ge , le , in ). Read-only. |
| `securityEnabled` | Boolean | Specifies whether the group is a security group. Required. Returned by default. Supports $filter ( eq , ne , not , in ). |
| `securityIdentifier` | String | Security identifier of the group, used in Windows scenarios. Read-only. Returned by default. |
| `serviceProvisioningErrors` | serviceProvisioningError collection | Errors published by a federated service describing a nontransient, service-specific error regarding the properties or link from a group object. Supports $filter ( eq , not , for isResolved and serviceInstance). |
| `theme` | string | Specifies a Microsoft 365 group's color theme. Possible values are Teal , Purple , Green , Blue , Pink , Orange , or Red . Returned by default. |
| `uniqueName` | String | The unique identifier that can be assigned to a group and used as an alternate key. Immutable. Read-only. |
| `unseenCount` | Int32 | Count of conversations that received new posts since the signed-in user last visited the group. Returned only on $select . Supported only on the Get group API ( GET /groups/{ID} ). |
| `visibility` | String | Specifies the group join policy and group content visibility for groups. Possible values are: Private , Public , or HiddenMembership . HiddenMembership can be set only for Microsoft 365 groups when the groups are created. It can't be updated later. Other values of visibility can be updated after group creation. If visibility value isn't specified during group creation on Microsoft Graph, a security group is created as Private by default, and the Microsoft 365 group is Public . Groups assignable to roles are always Private . To learn more, see group visibility options. Returned by default. Nullable. |

### group

| Property | Type | Description |
| --- | --- | --- |
| `allowExternalSenders` | Boolean | Indicates if people external to the organization can send messages to the group. The default value is false . Returned only on $select . Supported only on the Get group API ( GET /groups/{ID} ). |
| `assignedLabels` | assignedLabel collection | The list of sensitivity label pairs (label ID, label name) associated with a Microsoft 365 group. Returned only on $select . This property can be updated only in delegated scenarios where the caller requires both the Microsoft Graph permission and a supported administrator role. |
| `assignedLicenses` | assignedLicense collection | The licenses that are assigned to the group. Returned only on $select . Supports $filter ( eq ). Read-only. |
| `autoSubscribeNewMembers` | Boolean | Indicates if new members added to the group are autosubscribed to receive email notifications. You can set this property in a PATCH request for the group; don't set it in the initial POST request that creates the group. Default value is false . Returned only on $select . Supported only on the Get group API ( GET /groups/{ID} ). |
| `classification` | String | Describes a classification for the group (such as low, medium, or high business impact). Valid values for this property are defined by creating a ClassificationList setting value, based on the template definition. Returned by default. Supports $filter ( eq , ne , not , ge , le , startsWith ). |
| `createdDateTime` | DateTimeOffset | Timestamp of when the group was created. The value can't be modified and is automatically populated when the group is created. The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on January 1, 2014 is 2014-01-01T00:00:00Z . Returned by default. Read-only. |
| `deletedDateTime` | DateTimeOffset | For some Microsoft Entra objects (user, group, application), if the object is deleted, it's first logically deleted, and this property is updated with the date and time when the object was deleted. Otherwise this property is null . If the object is restored, this property is updated to null . Inherited from directoryObject. |
| `description` | String | An optional description for the group. Returned by default. Supports $filter ( eq , ne , not , ge , le , startsWith ) and $search . |
| `displayName` | String | The display name for the group. This property is required when a group is created and can't be cleared during updates. Maximum length is 256 characters. Returned by default. Supports $filter ( eq , ne , not , ge , le , in , startsWith , and eq on null values), $search , and $orderby . |
| `expirationDateTime` | DateTimeOffset | Timestamp of when the group is set to expire. It's null for security groups, but for Microsoft 365 groups, it represents when the group is set to expire as defined in the groupLifecyclePolicy. The Timestamp type represents date and time information using ISO 8601 format and is always in UTC. For example, midnight UTC on January 1, 2014 is 2014-01-01T00:00:00Z . Returned by default. Supports $filter ( eq , ne , not , ge , le , in ). Read-only. |
| `groupTypes` | String collection | Specifies the group type and its membership. If the collection contains Unified , the group is a Microsoft 365 group; otherwise, it's either a security group or a distribution group. For details, see groups overview. If the collection includes DynamicMembership , the group has dynamic membership; otherwise, membership is static. Returned by default. Supports $filter ( eq , not ). |
| `hasMembersWithLicenseErrors` | Boolean | Indicates whether there are members in this group that have license errors from its group-based license assignment. This property is never returned on a GET operation. You can use it as a $filter argument to get groups that have members with license errors (that is, filter for this property being true). See an example. Supports $filter ( eq ). |
| `hideFromAddressLists` | Boolean | True if the group isn't displayed in certain parts of the Outlook UI: the Address Book , address lists for selecting message recipients, and the Browse Groups dialog for searching groups; otherwise, false. The default value is false . Returned only on $select . Supported only on the Get group API ( GET /groups/{ID} ). |
| `hideFromOutlookClients` | Boolean | True if the group isn't displayed in Outlook clients, such as Outlook for Windows and Outlook on the web; otherwise, false. The default value is false . Returned only on $select . Supported only on the Get group API ( GET /groups/{ID} ). |
| `id` | String | The unique identifier for the group. Returned by default. Inherited from directoryObject. Key. Not nullable. Read-only. Supports $filter ( eq , ne , not , in ). |
| `isArchived` | Boolean | When a group is associated with a team, this property determines whether the team is in read-only mode. To read this property, use the /group/{groupId}/team endpoint or the Get team API. To update this property, use the archiveTeam and unarchiveTeam APIs. |
| `isAssignableToRole` | Boolean | Indicates whether this group can be assigned to a Microsoft Entra role. Optional. This property can only be set while creating the group and is immutable. If set to true , the securityEnabled property must also be set to true , visibility must be Hidden , and the group can't be a dynamic group (that is, groupTypes can't contain DynamicMembership ). Only callers with at least the Privileged Role Administrator role can set this property. The caller must also be assigned the RoleManagement.ReadWrite.Directory permission to set this property or update the membership of such groups. For more, see Using a group to manage Microsoft Entra role assignments Using this feature requires a Microsoft Entra ID P1 license. Returned by default. Supports $filter ( eq , ne , not ). |
| `isSubscribedByMail` | Boolean | Indicates whether the signed-in user is subscribed to receive email conversations. The default value is true . Returned only on $select . Supported only on the Get group API ( GET /groups/{ID} ). |
| `licenseProcessingState` | String | Indicates the status of the group license assignment to all group members. The default value is false . Read-only. Possible values: QueuedForProcessing , ProcessingInProgress , and ProcessingComplete . Returned only on $select . Read-only. |
| `mail` | String | The SMTP address for the group, for example, &quot; [email&#160;protected] &quot;. Returned by default. Read-only. Supports $filter ( eq , ne , not , ge , le , in , startsWith , and eq on null values). |
| `mailEnabled` | Boolean | Specifies whether the group is mail-enabled. Required. Returned by default. Supports $filter ( eq , ne , not ). |
| `mailNickname` | String | The mail alias for the group, unique for Microsoft 365 groups in the organization. Maximum length is 64 characters. This property can contain only characters in the ASCII character set 0 - 127 except the following characters: @ () \ [] &quot; ; : &lt;&gt; , SPACE . Required. Returned by default. Supports $filter ( eq , ne , not , ge , le , in , startsWith , and eq on null values). |
| `membershipRule` | String | The rule that determines members for this group if the group is a dynamic group (groupTypes contains DynamicMembership ). For more information about the syntax of the membership rule, see Membership Rules syntax. Returned by default. Supports $filter ( eq , ne , not , ge , le , startsWith ). |
| `membershipRuleProcessingState` | String | Indicates whether the dynamic membership processing is on or paused. Possible values are On or Paused . Returned by default. Supports $filter ( eq , ne , not , in ). |
| `onPremisesDomainName` | String | Contains the on-premises domain FQDN , also called dnsDomainName synchronized from the on-premises directory. The property is only populated for customers synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Returned by default. Read-only. |
| `onPremisesLastSyncDateTime` | DateTimeOffset | Indicates the last time at which the group was synced with the on-premises directory. The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time. For example, midnight UTC on January 1, 2014 is 2014-01-01T00:00:00Z . Returned by default. Read-only. Supports $filter ( eq , ne , not , ge , le , in ). |
| `onPremisesNetBiosName` | String | Contains the on-premises netBios name synchronized from the on-premises directory. The property is only populated for customers synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Returned by default. Read-only. |
| `onPremisesProvisioningErrors` | onPremisesProvisioningError collection | Errors when using Microsoft synchronization product during provisioning. Returned by default. Supports $filter ( eq , not ). |
| `onPremisesSamAccountName` | String | Contains the on-premises SAM account name synchronized from the on-premises directory. The property is only populated for customers synchronizing their on-premises directory to Microsoft Entra ID via Microsoft Entra Connect. Returned by default. Supports $filter ( eq , ne , not , ge , le , in , startsWith ). Read-only. |
| `onPremisesSecurityIdentifier` | String | Contains the on-premises security identifier (SID) for the group synchronized from on-premises to the cloud. Read-only. Returned by default. Supports $filter ( eq including on null values). |
| `onPremisesSyncEnabled` | Boolean | true if this group is synced from an on-premises directory; false if this group was originally synced from an on-premises directory but is no longer synced; null if this object has never synced from an on-premises directory (default). Returned by default. Read-only. Supports $filter ( eq , ne , not , in , and eq on null values). |
| `preferredDataLocation` | String | The preferred data location for the Microsoft 365 group. By default, the group inherits the group creator's preferred data location. To set this property, the calling app must be granted the Directory.ReadWrite.All permission and the user be assigned at least one of the following Microsoft Entra roles: User Account Administrator Directory Writer Exchange Administrator SharePoint Administrator For more information about this property, see OneDrive Online Multi-Geo. Nullable. Returned by default. |
| `preferredLanguage` | String | The preferred language for a Microsoft 365 group. Should follow ISO 639-1 Code; for example, en-US . Returned by default. Supports $filter ( eq , ne , not , ge , le , in , startsWith , and eq on null values). |
| `proxyAddresses` | String collection | Email addresses for the group that direct to the same group mailbox. For example: [&quot;SMTP: [email&#160;protected] &quot;, &quot;smtp: [email&#160;protected] &quot;] . The any operator is required to filter expressions on multi-valued properties. Returned by default. Read-only. Not nullable. Supports $filter ( eq , not , ge , le , startsWith , endsWith , /$count eq 0 , /$count ne 0 ). |
| `renewedDateTime` | DateTimeOffset | Timestamp of when the group was last renewed. This value can't be modified directly and is only updated via the renew service action. The Timestamp type represents date and time information using ISO 8601 format and is always in UTC. For example, midnight UTC on January 1, 2014 is 2014-01-01T00:00:00Z . Returned by default. Supports $filter ( eq , ne , not , ge , le , in ). Read-only. |
| `securityEnabled` | Boolean | Specifies whether the group is a security group. Required. Returned by default. Supports $filter ( eq , ne , not , in ). |
| `securityIdentifier` | String | Security identifier of the group, used in Windows scenarios. Read-only. Returned by default. |
| `serviceProvisioningErrors` | serviceProvisioningError collection | Errors published by a federated service describing a nontransient, service-specific error regarding the properties or link from a group object. Supports $filter ( eq , not , for isResolved and serviceInstance). |
| `theme` | string | Specifies a Microsoft 365 group's color theme. Possible values are Teal , Purple , Green , Blue , Pink , Orange , or Red . Returned by default. |
| `uniqueName` | String | The unique identifier that can be assigned to a group and used as an alternate key. Immutable. Read-only. |
| `unseenCount` | Int32 | Count of conversations that received new posts since the signed-in user last visited the group. Returned only on $select . Supported only on the Get group API ( GET /groups/{ID} ). |
| `visibility` | String | Specifies the group join policy and group content visibility for groups. Possible values are: Private , Public , or HiddenMembership . HiddenMembership can be set only for Microsoft 365 groups when the groups are created. It can't be updated later. Other values of visibility can be updated after group creation. If visibility value isn't specified during group creation on Microsoft Graph, a security group is created as Private by default, and the Microsoft 365 group is Public . Groups assignable to roles are always Private . To learn more, see group visibility options. Returned by default. Nullable. |

### internalSponsors

| Property | Type | Description |
| --- | --- | --- |
| `accessId` | privilegedAccessGroupRelationships | The identifier of a membership or ownership assignment relationship to the group. Required. The possible values are: owner , member , unknownFutureValue . |
| `action` | String | Represents the type of operation on the group membership or ownership assignment request. The possible values are: adminAssign , adminUpdate , adminRemove , selfActivate , selfDeactivate , adminExtend , adminRenew . adminAssign : For administrators to assign group membership or ownership to principals. adminRemove : For administrators to remove principals from group membership or ownership. adminUpdate : For administrators to change existing group membership or ownership assignments. adminExtend : For administrators to extend expiring assignments. adminRenew : For administrators to renew expired assignments. selfActivate : For principals to activate their assignments. selfDeactivate : For principals to deactivate their active assignments. |
| `approvalId` | String | The identifier of the approval of the request. Inherited from request. |
| `completedDateTime` | DateTimeOffset | The request completion date time. Inherited from request. |
| `createdBy` | identitySet | The principal that created this request. Inherited from request. Read-only. Supports $filter ( eq , ne , and on null values). |
| `createdDateTime` | DateTimeOffset | The request creation date time. Inherited from request. Read-only. |
| `customData` | String | Free text field to define any custom data for the request. Not used. Inherited from request. |
| `groupId` | String | The identifier of the group representing the scope of the membership or ownership assignment through PIM for groups. Required. |
| `id` | String | The unique identifier for the privilegedAccessGroupAssignmentScheduleRequest object. Key, not nullable, Read-only. Inherited from entity. Supports $filter ( eq , ne ). |
| `isValidationOnly` | Boolean | Determines whether the call is a validation or an actual call. Only set this property if you want to check whether an activation is subject to additional rules like MFA before actually submitting the request. |
| `justification` | String | A message provided by users and administrators when they create the privilegedAccessGroupAssignmentScheduleRequest object. |
| `principalId` | String | The identifier of the principal whose membership or ownership assignment to the group is managed through PIM for groups. Supports $filter ( eq , ne ). |
| `scheduleInfo` | requestSchedule | The period of the group membership or ownership assignment. Recurring schedules are currently unsupported. |
| `status` | String | The status of the group membership or ownership assignment request. Inherited from request. Read-only. Supports $filter ( eq , ne ). |
| `targetScheduleId` | String | The identifier of the schedule that's created from the membership or ownership assignment request. Supports $filter ( eq , ne ). |
| `ticketInfo` | ticketInfo | Ticket details linked to the group membership or ownership assignment request including details of the ticket number and ticket system. |

### privilegedAccessGroupAssignmentScheduleRequest

| Property | Type | Description |
| --- | --- | --- |
| `accessId` | privilegedAccessGroupRelationships | The identifier of a membership or ownership assignment relationship to the group. Required. The possible values are: owner , member , unknownFutureValue . |
| `action` | String | Represents the type of operation on the group membership or ownership assignment request. The possible values are: adminAssign , adminUpdate , adminRemove , selfActivate , selfDeactivate , adminExtend , adminRenew . adminAssign : For administrators to assign group membership or ownership to principals. adminRemove : For administrators to remove principals from group membership or ownership. adminUpdate : For administrators to change existing group membership or ownership assignments. adminExtend : For administrators to extend expiring assignments. adminRenew : For administrators to renew expired assignments. selfActivate : For principals to activate their assignments. selfDeactivate : For principals to deactivate their active assignments. |
| `approvalId` | String | The identifier of the approval of the request. Inherited from request. |
| `completedDateTime` | DateTimeOffset | The request completion date time. Inherited from request. |
| `createdBy` | identitySet | The principal that created this request. Inherited from request. Read-only. Supports $filter ( eq , ne , and on null values). |
| `createdDateTime` | DateTimeOffset | The request creation date time. Inherited from request. Read-only. |
| `customData` | String | Free text field to define any custom data for the request. Not used. Inherited from request. |
| `groupId` | String | The identifier of the group representing the scope of the membership or ownership assignment through PIM for groups. Required. |
| `id` | String | The unique identifier for the privilegedAccessGroupAssignmentScheduleRequest object. Key, not nullable, Read-only. Inherited from entity. Supports $filter ( eq , ne ). |
| `isValidationOnly` | Boolean | Determines whether the call is a validation or an actual call. Only set this property if you want to check whether an activation is subject to additional rules like MFA before actually submitting the request. |
| `justification` | String | A message provided by users and administrators when they create the privilegedAccessGroupAssignmentScheduleRequest object. |
| `principalId` | String | The identifier of the principal whose membership or ownership assignment to the group is managed through PIM for groups. Supports $filter ( eq , ne ). |
| `scheduleInfo` | requestSchedule | The period of the group membership or ownership assignment. Recurring schedules are currently unsupported. |
| `status` | String | The status of the group membership or ownership assignment request. Inherited from request. Read-only. Supports $filter ( eq , ne ). |
| `targetScheduleId` | String | The identifier of the schedule that's created from the membership or ownership assignment request. Supports $filter ( eq , ne ). |
| `ticketInfo` | ticketInfo | Ticket details linked to the group membership or ownership assignment request including details of the ticket number and ticket system. |

### privilegedidentitymanagement-for-groups-api-overview

| Property | Type | Description |
| --- | --- | --- |
| `appScopeId` | String | Identifier of the app specific scope when the assignment scope is app specific. The scope of an assignment determines the set of resources for which the principal has been granted access. App scopes are scopes that are defined and understood by a resource application only. For the entitlement management provider, use this property to specify a catalog. For example, /AccessPackageCatalog/beedadfe-01d5-4025-910b-84abb9369997 . Supports $filter ( eq , in ). For example, /roleManagement/entitlementManagement/roleAssignments?$filter=appScopeId eq '/AccessPackageCatalog/{catalog id}' . |
| `directoryScopeId` | String | Identifier of the directory object representing the scope of the assignment. The scope of an assignment determines the set of resources for which the principal has been granted access. Directory scopes are shared scopes stored in the directory that are understood by multiple applications, unlike app scopes that are defined and understood by a resource application only. Supports $filter ( eq , in ). |
| `id` | String | The unique identifier for the unifiedRoleAssignment. Key, not nullable, Read-only. |
| `principalId` | String | Identifier of the principal to which the assignment is granted. Supported principals are users, role-assignable groups, and service principals. Supports $filter ( eq , in ). |
| `roleDefinitionId` | String | Identifier of the unifiedRoleDefinition the assignment is for. Read-only. Supports $filter ( eq , in ). |

### privilegedidentitymanagementv3-overview

| Property | Type | Description |
| --- | --- | --- |
| `appScopeId` | String | Identifier of the app specific scope when the assignment scope is app specific. The scope of an assignment determines the set of resources for which the principal has been granted access. App scopes are scopes that are defined and understood by a resource application only. For the entitlement management provider, use this property to specify a catalog. For example, /AccessPackageCatalog/beedadfe-01d5-4025-910b-84abb9369997 . Supports $filter ( eq , in ). For example, /roleManagement/entitlementManagement/roleAssignments?$filter=appScopeId eq '/AccessPackageCatalog/{catalog id}' . |
| `directoryScopeId` | String | Identifier of the directory object representing the scope of the assignment. The scope of an assignment determines the set of resources for which the principal has been granted access. Directory scopes are shared scopes stored in the directory that are understood by multiple applications, unlike app scopes that are defined and understood by a resource application only. Supports $filter ( eq , in ). |
| `id` | String | The unique identifier for the unifiedRoleAssignment. Key, not nullable, Read-only. |
| `principalId` | String | Identifier of the principal to which the assignment is granted. Supported principals are users, role-assignable groups, and service principals. Supports $filter ( eq , in ). |
| `roleDefinitionId` | String | Identifier of the unifiedRoleDefinition the assignment is for. Read-only. Supports $filter ( eq , in ). |

### unifiedRoleAssignment

| Property | Type | Description |
| --- | --- | --- |
| `appScopeId` | String | Identifier of the app specific scope when the assignment scope is app specific. The scope of an assignment determines the set of resources for which the principal has been granted access. App scopes are scopes that are defined and understood by a resource application only. For the entitlement management provider, use this property to specify a catalog. For example, /AccessPackageCatalog/beedadfe-01d5-4025-910b-84abb9369997 . Supports $filter ( eq , in ). For example, /roleManagement/entitlementManagement/roleAssignments?$filter=appScopeId eq '/AccessPackageCatalog/{catalog id}' . |
| `directoryScopeId` | String | Identifier of the directory object representing the scope of the assignment. The scope of an assignment determines the set of resources for which the principal has been granted access. Directory scopes are shared scopes stored in the directory that are understood by multiple applications, unlike app scopes that are defined and understood by a resource application only. Supports $filter ( eq , in ). |
| `id` | String | The unique identifier for the unifiedRoleAssignment. Key, not nullable, Read-only. |
| `principalId` | String | Identifier of the principal to which the assignment is granted. Supported principals are users, role-assignable groups, and service principals. Supports $filter ( eq , in ). |
| `roleDefinitionId` | String | Identifier of the unifiedRoleDefinition the assignment is for. Read-only. Supports $filter ( eq , in ). |

### unifiedRoleAssignmentScheduleRequest

| Property | Type | Description |
| --- | --- | --- |
| `action` | String | Represents the type of the operation on the role assignment request. The possible values are: adminAssign , adminUpdate , adminRemove , selfActivate , selfDeactivate , adminExtend , adminRenew , selfExtend , selfRenew , unknownFutureValue . adminAssign : For administrators to assign roles to principals. adminRemove : For administrators to remove principals from roles. adminUpdate : For administrators to change existing role assignments. adminExtend : For administrators to extend expiring assignments. adminRenew : For administrators to renew expired assignments. selfActivate : For principals to activate their assignments. selfDeactivate : For principals to deactivate their active assignments. selfExtend : For principals to request to extend their expiring assignments. selfRenew : For principals to request to renew their expired assignments. |
| `approvalId` | String | The identifier of the approval of the request. Inherited from request. |
| `appScopeId` | String | Identifier of the app-specific scope when the assignment is scoped to an app. The scope of an assignment determines the set of resources for which the principal has been granted access. App scopes are scopes that are defined and understood by this application only. Use / for tenant-wide app scopes. Use directoryScopeId to limit the scope to particular directory objects, for example, administrative units. Supports $filter ( eq , ne , and on null values). |
| `completedDateTime` | DateTimeOffset | The request completion date time. Inherited from request. |
| `createdBy` | identitySet | The principal that created this request. Inherited from request. Read-only. Supports $filter ( eq , ne , and on null values). |
| `createdDateTime` | DateTimeOffset | The request creation date time. Inherited from request. Read-only. |
| `customData` | String | Free text field to define any custom data for the request. Not used. Inherited from request. |
| `directoryScopeId` | String | Identifier of the directory object representing the scope of the assignment. The scope of an assignment determines the set of resources for which the principal has been granted access. Directory scopes are shared scopes stored in the directory that are understood by multiple applications. Use / for tenant-wide scope. Use appScopeId to limit the scope to an application only. Supports $filter ( eq , ne , and on null values). |
| `id` | String | The unique identifier for the unifiedRoleAssignmentScheduleRequest object. Key, not nullable, Read-only. Inherited from entity. Supports $filter ( eq , ne ). |
| `isValidationOnly` | Boolean | Determines whether the call is a validation or an actual call. Only set this property if you want to check whether an activation is subject to additional rules like MFA before actually submitting the request. |
| `justification` | String | A message provided by users and administrators when create they create the unifiedRoleAssignmentScheduleRequest object. |
| `principalId` | String | Identifier of the principal that has been granted the assignment. Can be a user, role-assignable group, or a service principal. Supports $filter ( eq , ne ). |
| `roleDefinitionId` | String | Identifier of the unifiedRoleDefinition object that is being assigned to the principal. Supports $filter ( eq , ne ). |
| `scheduleInfo` | requestSchedule | The period of the role assignment. Recurring schedules are currently unsupported. |
| `status` | String | The status of the role assignment request. Inherited from request. Read-only. Supports $filter ( eq , ne ). |
| `targetScheduleId` | String | Identifier of the schedule object that's linked to the assignment request. Supports $filter ( eq , ne ). |
| `ticketInfo` | ticketInfo | Ticket details linked to the role assignment request including details of the ticket number and ticket system. |

### unifiedRoleDefinition

| Property | Type | Description |
| --- | --- | --- |
| `description` | String | The description for the unifiedRoleDefinition. Read-only when isBuiltIn is true . |
| `displayName` | String | The display name for the unifiedRoleDefinition. Read-only when isBuiltIn is true . Required. Supports $filter ( eq , in ). |
| `id` | String | The unique identifier for the role definition. Key, not nullable, Read-only. Inherited from entity. Supports $filter ( eq , in ). |
| `isBuiltIn` | Boolean | Flag indicating whether the role definition is part of the default set included in Microsoft Entra or a custom definition. Read-only. Supports $filter ( eq , in ). |
| `isEnabled` | Boolean | Flag indicating whether the role is enabled for assignment. If false the role is not available for assignment. Read-only when isBuiltIn is true. |
| `resourceScopes` | String collection | List of the scopes or permissions the role definition applies to. Currently only / is supported. Read-only when isBuiltIn is true. DO NOT USE. This will be deprecated soon. Attach scope to role assignment. |
| `rolePermissions` | unifiedRolePermission collection | List of permissions included in the role. Read-only when isBuiltIn is true . Required. |
| `templateId` | String | Custom template identifier that can be set when isBuiltIn is false but is read-only when isBuiltIn is true . This identifier is typically used if one needs an identifier to be the same across different directories. |
| `version` | String | Indicates version of the role definition. Read-only when **i |

