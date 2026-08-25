import { WatchTenantCollection as WatchTenantCollection_1d0591e3cf4f332c83a86da13a0de59a } from '@payloadcms/plugin-multi-tenant/client'
import { TenantField as TenantField_1d0591e3cf4f332c83a86da13a0de59a } from '@payloadcms/plugin-multi-tenant/client'
import { ExportListMenuItem as ExportListMenuItem_cdf7e044479f899a31f804427d568b36 } from '@payloadcms/plugin-import-export/rsc'
import { ImportListMenuItem as ImportListMenuItem_cdf7e044479f899a31f804427d568b36 } from '@payloadcms/plugin-import-export/rsc'
import { AssignTenantFieldTrigger as AssignTenantFieldTrigger_1d0591e3cf4f332c83a86da13a0de59a } from '@payloadcms/plugin-multi-tenant/client'
import { WorkflowView as WorkflowView_f4d5503956e2d624777a2e6c0bc05047 } from 'payload-kanban-board/dist/exports/client.js'
import { FormatField as FormatField_cdf7e044479f899a31f804427d568b36 } from '@payloadcms/plugin-import-export/rsc'
import { LimitField as LimitField_cdf7e044479f899a31f804427d568b36 } from '@payloadcms/plugin-import-export/rsc'
import { Page as Page_cdf7e044479f899a31f804427d568b36 } from '@payloadcms/plugin-import-export/rsc'
import { SortBy as SortBy_cdf7e044479f899a31f804427d568b36 } from '@payloadcms/plugin-import-export/rsc'
import { SortOrder as SortOrder_cdf7e044479f899a31f804427d568b36 } from '@payloadcms/plugin-import-export/rsc'
import { SelectionToUseField as SelectionToUseField_cdf7e044479f899a31f804427d568b36 } from '@payloadcms/plugin-import-export/rsc'
import { FieldsToExport as FieldsToExport_cdf7e044479f899a31f804427d568b36 } from '@payloadcms/plugin-import-export/rsc'
import { CollectionField as CollectionField_cdf7e044479f899a31f804427d568b36 } from '@payloadcms/plugin-import-export/rsc'
import { ExportPreview as ExportPreview_cdf7e044479f899a31f804427d568b36 } from '@payloadcms/plugin-import-export/rsc'
import { ExportSaveButton as ExportSaveButton_cdf7e044479f899a31f804427d568b36 } from '@payloadcms/plugin-import-export/rsc'
import { ImportPreview as ImportPreview_cdf7e044479f899a31f804427d568b36 } from '@payloadcms/plugin-import-export/rsc'
import { ImportSaveButton as ImportSaveButton_cdf7e044479f899a31f804427d568b36 } from '@payloadcms/plugin-import-export/rsc'
import { CustomerAutoFill as CustomerAutoFill_5c138208fc6a6657e86a40fe5d8ab8c0 } from 'payload-invoicepdf/client'
import { ProductAutoFill as ProductAutoFill_5c138208fc6a6657e86a40fe5d8ab8c0 } from 'payload-invoicepdf/client'
import { PdfHistory as PdfHistory_5c138208fc6a6657e86a40fe5d8ab8c0 } from 'payload-invoicepdf/client'
import { SendHistoryRowLabel as SendHistoryRowLabel_5c138208fc6a6657e86a40fe5d8ab8c0 } from 'payload-invoicepdf/client'
import { DownloadPdfButton as DownloadPdfButton_5c138208fc6a6657e86a40fe5d8ab8c0 } from 'payload-invoicepdf/client'
import { GeneratePdfButton as GeneratePdfButton_5c138208fc6a6657e86a40fe5d8ab8c0 } from 'payload-invoicepdf/client'
import { SendEmailButton as SendEmailButton_5c138208fc6a6657e86a40fe5d8ab8c0 } from 'payload-invoicepdf/client'
import { RelatedQuote as RelatedQuote_5c138208fc6a6657e86a40fe5d8ab8c0 } from 'payload-invoicepdf/client'
import { ConvertToInvoiceButton as ConvertToInvoiceButton_5c138208fc6a6657e86a40fe5d8ab8c0 } from 'payload-invoicepdf/client'
import { RelatedInvoices as RelatedInvoices_5c138208fc6a6657e86a40fe5d8ab8c0 } from 'payload-invoicepdf/client'
import { GlobalViewRedirect as GlobalViewRedirect_d6d5f193a167989e2ee7d14202901e62 } from '@payloadcms/plugin-multi-tenant/rsc'
import { TenantSelector as TenantSelector_d6d5f193a167989e2ee7d14202901e62 } from '@payloadcms/plugin-multi-tenant/rsc'
import { ImportExportProvider as ImportExportProvider_cdf7e044479f899a31f804427d568b36 } from '@payloadcms/plugin-import-export/rsc'
import { TenantSelectionProvider as TenantSelectionProvider_d6d5f193a167989e2ee7d14202901e62 } from '@payloadcms/plugin-multi-tenant/rsc'
import { DashboardView as DashboardView_883c31e5a2819bb83d4b37435313e9bf } from '../../../views/Dashboard'
import { InboxView as InboxView_f42111018d29697a143333087a42b27d } from '../../../views/Inbox'
import { HoyView as HoyView_b55d5afcc889648b4ed3cc8c954e93be } from '../../../views/Hoy'
import { CollectionCards as CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1 } from '@payloadcms/next/rsc'

/** @type import('payload').ImportMap */
export const importMap = {
  "@payloadcms/plugin-multi-tenant/client#WatchTenantCollection": WatchTenantCollection_1d0591e3cf4f332c83a86da13a0de59a,
  "@payloadcms/plugin-multi-tenant/client#TenantField": TenantField_1d0591e3cf4f332c83a86da13a0de59a,
  "@payloadcms/plugin-import-export/rsc#ExportListMenuItem": ExportListMenuItem_cdf7e044479f899a31f804427d568b36,
  "@payloadcms/plugin-import-export/rsc#ImportListMenuItem": ImportListMenuItem_cdf7e044479f899a31f804427d568b36,
  "@payloadcms/plugin-multi-tenant/client#AssignTenantFieldTrigger": AssignTenantFieldTrigger_1d0591e3cf4f332c83a86da13a0de59a,
  "payload-kanban-board/dist/exports/client.js#WorkflowView": WorkflowView_f4d5503956e2d624777a2e6c0bc05047,
  "@payloadcms/plugin-import-export/rsc#FormatField": FormatField_cdf7e044479f899a31f804427d568b36,
  "@payloadcms/plugin-import-export/rsc#LimitField": LimitField_cdf7e044479f899a31f804427d568b36,
  "@payloadcms/plugin-import-export/rsc#Page": Page_cdf7e044479f899a31f804427d568b36,
  "@payloadcms/plugin-import-export/rsc#SortBy": SortBy_cdf7e044479f899a31f804427d568b36,
  "@payloadcms/plugin-import-export/rsc#SortOrder": SortOrder_cdf7e044479f899a31f804427d568b36,
  "@payloadcms/plugin-import-export/rsc#SelectionToUseField": SelectionToUseField_cdf7e044479f899a31f804427d568b36,
  "@payloadcms/plugin-import-export/rsc#FieldsToExport": FieldsToExport_cdf7e044479f899a31f804427d568b36,
  "@payloadcms/plugin-import-export/rsc#CollectionField": CollectionField_cdf7e044479f899a31f804427d568b36,
  "@payloadcms/plugin-import-export/rsc#ExportPreview": ExportPreview_cdf7e044479f899a31f804427d568b36,
  "@payloadcms/plugin-import-export/rsc#ExportSaveButton": ExportSaveButton_cdf7e044479f899a31f804427d568b36,
  "@payloadcms/plugin-import-export/rsc#ImportPreview": ImportPreview_cdf7e044479f899a31f804427d568b36,
  "@payloadcms/plugin-import-export/rsc#ImportSaveButton": ImportSaveButton_cdf7e044479f899a31f804427d568b36,
  "payload-invoicepdf/client#CustomerAutoFill": CustomerAutoFill_5c138208fc6a6657e86a40fe5d8ab8c0,
  "payload-invoicepdf/client#ProductAutoFill": ProductAutoFill_5c138208fc6a6657e86a40fe5d8ab8c0,
  "payload-invoicepdf/client#PdfHistory": PdfHistory_5c138208fc6a6657e86a40fe5d8ab8c0,
  "payload-invoicepdf/client#SendHistoryRowLabel": SendHistoryRowLabel_5c138208fc6a6657e86a40fe5d8ab8c0,
  "payload-invoicepdf/client#DownloadPdfButton": DownloadPdfButton_5c138208fc6a6657e86a40fe5d8ab8c0,
  "payload-invoicepdf/client#GeneratePdfButton": GeneratePdfButton_5c138208fc6a6657e86a40fe5d8ab8c0,
  "payload-invoicepdf/client#SendEmailButton": SendEmailButton_5c138208fc6a6657e86a40fe5d8ab8c0,
  "payload-invoicepdf/client#RelatedQuote": RelatedQuote_5c138208fc6a6657e86a40fe5d8ab8c0,
  "payload-invoicepdf/client#ConvertToInvoiceButton": ConvertToInvoiceButton_5c138208fc6a6657e86a40fe5d8ab8c0,
  "payload-invoicepdf/client#RelatedInvoices": RelatedInvoices_5c138208fc6a6657e86a40fe5d8ab8c0,
  "@payloadcms/plugin-multi-tenant/rsc#GlobalViewRedirect": GlobalViewRedirect_d6d5f193a167989e2ee7d14202901e62,
  "@payloadcms/plugin-multi-tenant/rsc#TenantSelector": TenantSelector_d6d5f193a167989e2ee7d14202901e62,
  "@payloadcms/plugin-import-export/rsc#ImportExportProvider": ImportExportProvider_cdf7e044479f899a31f804427d568b36,
  "@payloadcms/plugin-multi-tenant/rsc#TenantSelectionProvider": TenantSelectionProvider_d6d5f193a167989e2ee7d14202901e62,
  "/views/Dashboard#DashboardView": DashboardView_883c31e5a2819bb83d4b37435313e9bf,
  "/views/Inbox#InboxView": InboxView_f42111018d29697a143333087a42b27d,
  "/views/Hoy#HoyView": HoyView_b55d5afcc889648b4ed3cc8c954e93be,
  "@payloadcms/next/rsc#CollectionCards": CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1
}
