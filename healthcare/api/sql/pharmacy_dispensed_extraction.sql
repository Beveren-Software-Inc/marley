-- Pharmacy Dispensed Medicine — Excel extraction for Legacy Sales Transactions
-- Schema: CLINIC2 (Serene). Document type SAL only; patient routes IP + OP.
-- Expected header counts (as of 7 Nov 2026): OP 43,709 · IP 73,321 · EMP 1,201 (exclude EMP).
-- Amount charged = NET_BILL_AMOUNT (not TOTAL_BILL_AMOUNT). Qty = ITEM_SMALL_QTY.
--
-- In SQL Developer: run each query → Export → Excel (.xlsx).
-- Name the sheets INV_00_01 and INV_00_02 (or keep Oracle column headers so
-- Healthcare Settings → Oracle → ERPNext → Legacy Sales / Pharmacy Dispensed
-- can recognise the upload).

-- ---------------------------------------------------------------------------
-- 0) Sanity: cost + profit = net on every SAL header
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS rows_where_rule_holds
FROM   CLINIC2.INV_00_01
WHERE  TRANS_TYPE_NUM = 'SAL'
AND    ROUND(NET_BILL_AMOUNT - TOTAL_BILL_AMOUNT, 3) = ROUND(TOTAL_PROFIT_AMT, 3);
-- Expect ~117,029 when the rule is universal.

-- ---------------------------------------------------------------------------
-- 1) Header counts by source (reconcile target)
-- ---------------------------------------------------------------------------
SELECT TRANS_SOURCE, COUNT(*) AS documents
FROM   CLINIC2.INV_00_01
WHERE  TRANS_TYPE_NUM = 'SAL'
GROUP BY TRANS_SOURCE
ORDER BY documents DESC;

-- ---------------------------------------------------------------------------
-- 2) INV_00_01 — SAL headers for hospital patients only (IP + OP)
--    Exclude EMP (staff purchases) and all Rose SI* / ISU / SLR types.
-- ---------------------------------------------------------------------------
SELECT h.*
FROM   CLINIC2.INV_00_01 h
WHERE  h.TRANS_TYPE_NUM = 'SAL'
AND    h.TRANS_SOURCE IN ('IP', 'OP')
ORDER BY h.TRANS_NUM;

-- ---------------------------------------------------------------------------
-- 3) INV_00_02 — lines for those same SAL IP/OP headers
-- ---------------------------------------------------------------------------
SELECT d.*
FROM   CLINIC2.INV_00_02 d
JOIN   CLINIC2.INV_00_01 h
       ON  d.TRANS_NUM = h.TRANS_NUM
       AND d.TRANS_TYPE_NUM = h.TRANS_TYPE_NUM
WHERE  h.TRANS_TYPE_NUM = 'SAL'
AND    h.TRANS_SOURCE IN ('IP', 'OP')
ORDER BY d.TRANS_NUM, d.SR_NUM;

-- ---------------------------------------------------------------------------
-- 4) Optional audit feed (joined patient) — not required for the reconcile
--    button; useful for spot-checks. Quantity = ITEM_SMALL_QTY.
-- ---------------------------------------------------------------------------
-- Outpatient
SELECT v.VISIT_PATIENT_NUM AS PATIENT_FILE_NO,
       h.TRANS_NUM, h.TRANS_TYPE_NUM, h.TRANS_DATE, h.BRANCH_NUM,
       'OP' AS SETTING, h.VISIT_NUM, CAST(NULL AS NUMBER) AS ADMISSION_NUM,
       d.SR_NUM, d.ITEM_NUM, i.ITEM_NAM,
       d.ITEM_SMALL_QTY AS QTY_UNITS, d.SHOW_UOM, d.ITEM_EXPIRY_DATE,
       d.SHOW_AMT AS LINE_AMOUNT, h.NET_BILL_AMOUNT AS DOCUMENT_AMOUNT,
       h.PINK_PRESC_NUM, h.IS_PINK_PRESC_CHARGE, h.PINK_PRESC_AMT,
       h.CR_ID AS DISPENSED_BY
FROM   CLINIC2.INV_00_01 h
JOIN   CLINIC2.INV_00_02 d
       ON d.TRANS_NUM = h.TRANS_NUM AND d.TRANS_TYPE_NUM = h.TRANS_TYPE_NUM
JOIN   CLINIC2.VISIT_00_01 v ON v.VISIT_NUM = h.VISIT_NUM
LEFT JOIN CLINIC2.ITEM_00_01 i ON i.ITEM_NUM = d.ITEM_NUM
WHERE  h.TRANS_TYPE_NUM = 'SAL' AND h.TRANS_SOURCE = 'OP';

-- Inpatient
SELECT a.PATIENT_NUM AS PATIENT_FILE_NO,
       h.TRANS_NUM, h.TRANS_TYPE_NUM, h.TRANS_DATE, h.BRANCH_NUM,
       'IP' AS SETTING, CAST(NULL AS NUMBER) AS VISIT_NUM, h.ADMISSION_NUM,
       d.SR_NUM, d.ITEM_NUM, i.ITEM_NAM,
       d.ITEM_SMALL_QTY AS QTY_UNITS, d.SHOW_UOM, d.ITEM_EXPIRY_DATE,
       d.SHOW_AMT AS LINE_AMOUNT, h.NET_BILL_AMOUNT AS DOCUMENT_AMOUNT,
       h.PINK_PRESC_NUM, h.IS_PINK_PRESC_CHARGE, h.PINK_PRESC_AMT,
       h.CR_ID AS DISPENSED_BY
FROM   CLINIC2.INV_00_01 h
JOIN   CLINIC2.INV_00_02 d
       ON d.TRANS_NUM = h.TRANS_NUM AND d.TRANS_TYPE_NUM = h.TRANS_TYPE_NUM
JOIN   CLINIC2.IP_ADMISSION_01 a ON a.ADMISSION_NUM = h.ADMISSION_NUM
LEFT JOIN CLINIC2.ITEM_00_01 i ON i.ITEM_NUM = d.ITEM_NUM
WHERE  h.TRANS_TYPE_NUM = 'SAL' AND h.TRANS_SOURCE = 'IP';
