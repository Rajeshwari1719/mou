# Existing local upload reconciliation

Read-only inventory made on 2026-09-29. Files were matched against `documents.file_path` in the locally configured `college_mou` MySQL database. No upload file or database row was changed.

| File | Bytes | Database mapping | SHA-256 |
|---|---:|---|---|
| `199f9d91-48a0-4100-8f80-ba42e52973e1.pdf` | 292148 | Referenced by document ID 3 (`/uploads/199f9d91-48a0-4100-8f80-ba42e52973e1.pdf`) | `6EFCDCDB5A101C75244A8E26071C52E7C1E67D57E60938E098F1274362C0DFD8` |
| `2262cb55-4f0c-47c5-a3b6-6ee1890b2d40.pdf` | 4803 | No reference found; retained | `7FB133E3FFC756BA72CA1F5FAB43939D33DEEFA021A4901AFEF3616059A7EBAE` |
| `2a0ab942-96a4-4736-8a0e-cdf1b9e89d5b.txt` | 18 | No reference found; retained | `CF2D5839B8F857196480BD959F4AE4097BE79EF2EFD10CAD4B8704D44EAAC9E4` |
| `2b4aa26f-ac9d-4e77-aefd-bac5d0875184.pdf` | 292148 | No reference found; retained | `6EFCDCDB5A101C75244A8E26071C52E7C1E67D57E60938E098F1274362C0DFD8` |
| `65b73cf9-e6a3-4573-bdb0-fa11493a5368.pdf` | 4849 | No reference found; retained | `50E464E0F83E135D629732636FA4E8B0CA2939EB9FAB3A2D8B079CB4DE1C9A51` |
| `942e98ff-3cfa-46df-a41a-474c10b3ba95.pdf` | 4798 | No reference found; retained | `D01C9C39E4D00463E44E22F76497138024E774F6E55C5CF0349DC08451A3F7DB` |
| `c5aaabbf-6da8-4584-8a37-b882ed09770f.pdf` | 4803 | No reference found; retained | `7FB133E3FFC756BA72CA1F5FAB43939D33DEEFA021A4901AFEF3616059A7EBAE` |
| `e1727aa4-32b9-4f28-a3c5-66c0abc8420a.pdf` | 4959 | No reference found; retained | `88B32E87865059C7F9D1958891641B5D83DED29D578E308A289FAE876F89AFDB` |
| `ef29dfe3-4970-4958-92bd-af4847fe4564.txt` | 18 | No reference found; retained | `CF2D5839B8F857196480BD959F4AE4097BE79EF2EFD10CAD4B8704D44EAAC9E4` |

The two PDFs with hash prefix `6EFCDCDB...` are byte-identical; the two 4803-byte PDFs share a hash; and the two text files share a hash. Hashes are for comparison, not evidence that these files are disposable. Eight files have no row reference in the inspected database. All were retained because they may belong to another database copy or represent user documents awaiting reconciliation. `server/uploads/.gitkeep` is an empty repository placeholder and is not an uploaded document.
