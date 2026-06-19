---
name: rsa-crypto
description: RSA 混合加密解密工具。当用户需要加密字符串、解密密文、加密文件或解密文件时使用此技能。支持 AES-256-GCM + RSA-OAEP 混合加密方案，无明文长度限制。
---

# RSA 加密工具

## 使用原则

1. 用户说"加密"、"encrypt"、"帮我加密这段内容"时，使用 `rsa_encrypt_text`
2. 用户说"解密"、"decrypt"、"帮我解密这段密文"时，使用 `rsa_decrypt_text`
3. 用户要加密文件时，使用 `rsa_encrypt_file`
4. 用户要解密 `.enc` 文件时，使用 `rsa_decrypt_file`
5. 不确定有哪些密钥可用时，先调用 `rsa_list_keys` 查看
6. 用户要求新建密钥对时，使用 `rsa_generate_keypair`

## 密钥选择规则

- 所有加密/解密工具的 `keyId` 参数**可选**，不传时自动使用用户配置的默认密钥
- 如果用户指定了密钥名称，先 `rsa_list_keys` 查找对应 id，再传入
- 加密需要有公钥的密钥（type 为 `pair` 或 `public`）
- 解密需要有私钥的密钥（type 为 `pair` 或 `private`）

## 文件操作安全约束

- 禁止操作系统目录（/usr、/bin、/etc、Windows\System32 等）
- 输出文件加密后默认追加 `.enc` 后缀
- 文件大小限制 50MB

## 工具返回值说明

- `rsa_list_keys` → 返回所有密钥条目数组
- `rsa_encrypt_text` → 返回 `{ cipherBase64: "..." }` 密文字符串
- `rsa_decrypt_text` → 返回 `{ plaintext: "..." }` 明文字符串
- `rsa_encrypt_file` / `rsa_decrypt_file` → 返回 `{ outputPath, size }`
- `rsa_generate_keypair` → 返回新创建的密钥条目

## 典型场景

- 用户：帮我加密 "my-secret-password" → 调用 rsa_encrypt_text
- 用户：解密这段 Base64 → 调用 rsa_decrypt_text
- 用户：把 ~/secrets.json 加密 → 调用 rsa_encrypt_file（MODERATE，需确认）
- 用户：我想生成一个 4096 位的密钥对叫"工作密钥" → 调用 rsa_generate_keypair（MODERATE，需确认）
