/**
 * 文件路径：apps/web/scripts/iGM_AddModule8Locales.ts
 * 所属层：前端 / 构建脚本层
 * 路由：无
 * 模块：iGM_AddModule8Locales
 * 作用：向五个语言包增量写入模块八文案键（iGCraftLit 用户管理规定）
 * 内容：规定全文七章（含第六章量化处罚）、常见问题 Q1-Q4、
 *       规定页 SEO 元信息、注册页阅读同意勾选与阅读弹窗文案
 * 说明：幂等——重复执行仅覆盖同名字段，不触碰其他模块文案
 */

// 导入依赖 //
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// 类型定义 //
type iGM_Dict = Record<string, unknown>;

// 核心逻辑 //
/** 每个语言包的模块八文案 */
const iGM_LocalePayloads: Record<string, iGM_Dict> = {
  "zh-CN": {
    pages: {
      userRules: {
        title: "用户管理规定",
        description:
          "iGCraftLit Community 用户管理规定全文：全球共处、账号管理、行为规范、知识产权与量化处罚",
      },
    },
    auth: {
      register: {
        agreementPrefix: "我已阅读并同意",
        agreementRules: "《iGCraftLit 用户管理规定》",
        agreementSuffix: "",
        agreementRequired: "请先阅读并同意《iGCraftLit 用户管理规定》",
        rulesModal: {
          title: "iGCraftLit 用户管理规定",
          scrollHint: "请滚动阅读至底部后，再确认同意",
          finish: "已完成阅读，选择遵守规定",
          cancel: "暂不同意",
        },
      },
    },
    userRules: {
      title: "iGCraftLit 用户管理规定",
      tocTitle: "ON THIS PAGE",
      chapters: [
        {
          id: "chapter-1",
          title: "第一章 总则",
          paragraphs: [
            "iGCraftLit Community 是面向所有探星者的开放社区，我们因梦想而聚，因创造而强，在探索中前行，在创新中突破，以求真之心共建社区。",
            "本社区立足国际背景，面向全球用户，致力于打造一个跨越国界、多元共存、平等交流的全球性社区。为维护社区秩序，保障全球用户权益，特制定本规定。",
          ],
        },
        {
          id: "chapter-2",
          title: "第二章 全球共处原则",
          items: [
            "本社区倡导全球共处、多元包容、彼此尊重。来自不同国家、地区、民族、文化背景的探星者，均可在本社区平等交流。",
            "用户应尊重不同文化、宗教信仰与风俗习惯，不得因国籍、种族、性别、宗教、地域等差异歧视、攻击或侮辱他人。",
            "本社区不隶属于任何国家或政治实体，用户须自行遵守所在地法律及国际通行准则。",
            "在跨越文化差异时，应以理性、克制、友善为交流底线，共同维护全球社区的良好氛围。",
          ],
        },
        {
          id: "chapter-3",
          title: "第三章 账号管理",
          items: [
            "用户注册须提供真实可用的邮箱。",
            "账号归 iGCraftLit 所有，用户享有使用权。禁止转让、出租、售卖账号。",
            "用户须妥善保管密码，因密码泄露造成的损失由用户自行承担。",
            "注册成功后，系统自动分配 11 位 iGMUid，作为用户在社区中的唯一认证值。",
          ],
        },
        {
          id: "chapter-4",
          title: "第四章 社区行为规范与法律底线",
          items: [
            "用户须遵守所在地法律法规以及国际公认的法律准则，不得利用本社区从事任何违法活动。",
            "严禁发布、传播、存储以下内容，包括但不限于：色情、淫秽、低俗、性暗示内容；暴力、血腥、恐怖、残忍、自杀自残内容；煽动仇恨、歧视、民族对立、宗教冲突内容；虚假信息、谣言、诈骗、传销、非法广告；侵犯他人隐私、肖像权、名誉权、知识产权的行为；病毒、木马、外挂、恶意代码、网络攻击工具；涉及未成年人保护的违规内容。",
            "禁止刷屏、恶意灌水、恶意举报、扰乱社区秩序等行为。",
            "尊重他人，理性讨论，不得人身攻击、诽谤、侮辱、威胁他人。",
            "不得以 iGCraftLit 名义从事任何未经授权的商业活动或政治活动。",
          ],
        },
        {
          id: "chapter-5",
          title: "第五章 知识产权",
          items: [
            "用户在社区发布的内容，其著作权归用户所有。",
            "用户授权 iGCraftLit 在社区范围内展示、传播、存储相关内容。",
            "禁止未经授权转载、抄袭他人原创内容，违者将承担相应法律责任。",
            "用户应确保自己发布的内容不侵犯任何第三方的知识产权，如产生纠纷，由发布者自行承担全部责任。",
          ],
        },
        {
          id: "chapter-6",
          title: "第六章 违规处理与量化处罚",
          intro:
            "若用户在社区内的违规行为被管理员发现，将依照中华人民共和国相关法律法规及本规定进行处置，并对违规账号执行相应的量化处罚：",
          penalties: [
            {
              id: "rule-6-1",
              title: "首次轻微违规",
              detail: "予以警告，或处以 1 天禁言处罚。",
            },
            {
              id: "rule-6-2",
              title: "一般违规行为",
              detail: "处以 3 天禁言处罚。",
            },
            {
              id: "rule-6-3",
              title: "较重违规行为",
              detail: "处以 7 天禁言处罚。",
            },
            {
              id: "rule-6-4",
              title: "严重违规行为",
              detail: "处以 30 天封禁处罚。",
            },
            {
              id: "rule-6-5",
              title: "情节特别严重",
              detail:
                "情节特别严重、触犯法律或多次拒不改正的：予以永久封禁，最高予以删除账号处置，并保留配合执法机关调查的权利。",
            },
            {
              id: "rule-6-6",
              title: "损失赔偿",
              detail: "因违规行为给社区或第三方造成损失的，违规者应承担相应赔偿责任。",
            },
          ],
        },
        {
          id: "chapter-7",
          title: "第七章 附则",
          items: [
            "本规定解释权归 iGCraftLit Community 所有。",
            "本规定自用户注册之日起生效。用户继续使用社区服务即视为同意本规定。",
            "本规定可能根据法律要求或社区发展进行更新，更新后将在社区公告中发布，用户继续使用即视为接受更新后的规定。",
          ],
        },
      ],
      faq: {
        title: "常见问题",
        items: [
          {
            id: "faq-q1",
            q: "Q1: 违规后会受到什么处罚？",
            a: "管理员将根据违规情节，依照本规定第六章执行警告、1 天/3 天/7 天禁言、30 天封禁、永久封禁直至删除账号的量化处罚；触犯法律的，将配合执法机关调查。",
          },
          {
            id: "faq-q2",
            q: "Q2: 账号可以转让或买卖吗？",
            a: "不可以。账号归 iGCraftLit 所有，用户仅享有使用权，禁止转让、出租或售卖账号。",
          },
          {
            id: "faq-q3",
            q: "Q3: 对处罚结果有异议怎么办？",
            a: "如对处罚有异议，可通过社区通知或邮件 igcraftlit@outlook.com 联系管理员申请复核，我们会核实情况后予以答复。",
          },
          {
            id: "faq-q4",
            q: "Q4: 规定更新后如何生效？",
            a: "规定更新后将在社区公告中发布；你继续使用社区服务，即视为接受更新后的规定。",
          },
        ],
      },
    },
  },

  "zh-TW": {
    pages: {
      userRules: {
        title: "使用者管理規定",
        description:
          "iGCraftLit Community 使用者管理規定全文：全球共處、帳號管理、行為規範、智慧財產權與量化處罰",
      },
    },
    auth: {
      register: {
        agreementPrefix: "我已閱讀並同意",
        agreementRules: "《iGCraftLit 使用者管理規定》",
        agreementSuffix: "",
        agreementRequired: "請先閱讀並同意《iGCraftLit 使用者管理規定》",
        rulesModal: {
          title: "iGCraftLit 使用者管理規定",
          scrollHint: "請捲動閱讀至底部後，再確認同意",
          finish: "已完成閱讀，選擇遵守規定",
          cancel: "暫不同意",
        },
      },
    },
    userRules: {
      title: "iGCraftLit 使用者管理規定",
      tocTitle: "ON THIS PAGE",
      chapters: [
        {
          id: "chapter-1",
          title: "第一章 總則",
          paragraphs: [
            "iGCraftLit Community 是面向所有探星者的開放社群，我們因夢想而聚，因創造而強，在探索中前行，在創新中突破，以求真之心共建社群。",
            "本社群立足國際背景，面向全球使用者，致力於打造一個跨越國界、多元共存、平等交流的全球性社群。為維護社群秩序，保障全球使用者權益，特制定本規定。",
          ],
        },
        {
          id: "chapter-2",
          title: "第二章 全球共處原則",
          items: [
            "本社群倡導全球共處、多元包容、彼此尊重。來自不同國家、地區、民族、文化背景的探星者，均可在本社群平等交流。",
            "使用者應尊重不同文化、宗教信仰與風俗習慣，不得因國籍、種族、性別、宗教、地域等差異歧視、攻擊或侮辱他人。",
            "本社群不隸屬於任何國家或政治實體，使用者須自行遵守所在地法律及國際通行準則。",
            "在跨越文化差異時，應以理性、克制、友善為交流底線，共同維護全球社群的良好氛圍。",
          ],
        },
        {
          id: "chapter-3",
          title: "第三章 帳號管理",
          items: [
            "使用者註冊須提供真實可用的信箱。",
            "帳號歸 iGCraftLit 所有，使用者享有使用權。禁止轉讓、出租、販售帳號。",
            "使用者須妥善保管密碼，因密碼外洩造成的損失由使用者自行承擔。",
            "註冊成功後，系統自動分配 11 位 iGMUid，作為使用者在社群中的唯一認證值。",
          ],
        },
        {
          id: "chapter-4",
          title: "第四章 社群行為規範與法律底線",
          items: [
            "使用者須遵守所在地法律法規以及國際公認的法律準則，不得利用本社群從事任何違法活動。",
            "嚴禁發布、傳播、儲存以下內容，包括但不限於：色情、猥褻、低俗、性暗示內容；暴力、血腥、恐怖、殘忍、自殺自殘內容；煽動仇恨、歧視、民族對立、宗教衝突內容；虛假資訊、謠言、詐騙、傳銷、非法廣告；侵犯他人隱私、肖像權、名譽權、智慧財產權的行為；病毒、木馬、外掛、惡意程式碼、網路攻擊工具；涉及未成年人保護的違規內容。",
            "禁止洗版、惡意灌水、惡意檢舉、擾亂社群秩序等行為。",
            "尊重他人，理性討論，不得人身攻擊、誹謗、侮辱、威脅他人。",
            "不得以 iGCraftLit 名義從事任何未經授權的商業活動或政治活動。",
          ],
        },
        {
          id: "chapter-5",
          title: "第五章 智慧財產權",
          items: [
            "使用者在社群發布的內容，其著作權歸使用者所有。",
            "使用者授權 iGCraftLit 在社群範圍內展示、傳播、儲存相關內容。",
            "禁止未經授權轉載、抄襲他人原創內容，違者將承擔相應法律責任。",
            "使用者應確保自己發布的內容不侵犯任何第三方的智慧財產權，如產生糾紛，由發布者自行承擔全部責任。",
          ],
        },
        {
          id: "chapter-6",
          title: "第六章 違規處理與量化處罰",
          intro:
            "若使用者在社群內的違規行為被管理員發現，將依照中華人民共和國相關法律法規及本規定進行處置，並對違規帳號執行相應的量化處罰：",
          penalties: [
            {
              id: "rule-6-1",
              title: "首次輕微違規",
              detail: "予以警告，或處以 1 天禁言處罰。",
            },
            {
              id: "rule-6-2",
              title: "一般違規行為",
              detail: "處以 3 天禁言處罰。",
            },
            {
              id: "rule-6-3",
              title: "較重違規行為",
              detail: "處以 7 天禁言處罰。",
            },
            {
              id: "rule-6-4",
              title: "嚴重違規行為",
              detail: "處以 30 天封鎖處罰。",
            },
            {
              id: "rule-6-5",
              title: "情節特別嚴重",
              detail:
                "情節特別嚴重、觸犯法律或多次拒不改正的：予以永久封鎖，最高予以刪除帳號處置，並保留配合執法機關調查的權利。",
            },
            {
              id: "rule-6-6",
              title: "損失賠償",
              detail: "因違規行為給社群或第三方造成損失的，違規者應承擔相應賠償責任。",
            },
          ],
        },
        {
          id: "chapter-7",
          title: "第七章 附則",
          items: [
            "本規定解釋權歸 iGCraftLit Community 所有。",
            "本規定自使用者註冊之日起生效。使用者繼續使用社群服務即視為同意本規定。",
            "本規定可能根據法律要求或社群發展進行更新，更新後將在社群公告中發布，使用者繼續使用即視為接受更新後的規定。",
          ],
        },
      ],
      faq: {
        title: "常見問題",
        items: [
          {
            id: "faq-q1",
            q: "Q1: 違規後會受到什麼處罰？",
            a: "管理員將依違規情節，按照本規定第六章執行警告、1 天／3 天／7 天禁言、30 天封鎖、永久封鎖直至刪除帳號的量化處罰；觸犯法律的，將配合執法機關調查。",
          },
          {
            id: "faq-q2",
            q: "Q2: 帳號可以轉讓或買賣嗎？",
            a: "不可以。帳號歸 iGCraftLit 所有，使用者僅享有使用權，禁止轉讓、出租或販售帳號。",
          },
          {
            id: "faq-q3",
            q: "Q3: 對處罰結果有異議怎麼辦？",
            a: "如對處罰有異議，可透過社群通知或信件 igcraftlit@outlook.com 聯絡管理員申請複核，我們會核實情況後予以答覆。",
          },
          {
            id: "faq-q4",
            q: "Q4: 規定更新後如何生效？",
            a: "規定更新後將在社群公告中發布；你繼續使用社群服務，即視為接受更新後的規定。",
          },
        ],
      },
    },
  },

  en: {
    pages: {
      userRules: {
        title: "User Rules",
        description:
          "The full iGCraftLit Community User Rules: global coexistence, account management, conduct standards, intellectual property and quantified penalties",
      },
    },
    auth: {
      register: {
        agreementPrefix: "I have read and agree to the ",
        agreementRules: "iGCraftLit User Rules",
        agreementSuffix: "",
        agreementRequired:
          "Please read and agree to the iGCraftLit User Rules first",
        rulesModal: {
          title: "iGCraftLit User Rules",
          scrollHint: "Please scroll to the bottom before confirming",
          finish: "Finished reading — I accept the rules",
          cancel: "Not now",
        },
      },
    },
    userRules: {
      title: "iGCraftLit User Rules",
      tocTitle: "ON THIS PAGE",
      chapters: [
        {
          id: "chapter-1",
          title: "Chapter 1 General Provisions",
          paragraphs: [
            "iGCraftLit Community is an open community for all Stargazers. United by our dreams and strengthened through creativity, we advance in exploration and break through in innovation, building this community together with a truth-seeking spirit.",
            "Rooted in an international outlook and open to users worldwide, this community is committed to being a global space that crosses borders, embraces diversity and enables equal exchange. These Rules are enacted to safeguard community order and protect the rights and interests of all users worldwide.",
          ],
        },
        {
          id: "chapter-2",
          title: "Chapter 2 Principles of Global Coexistence",
          items: [
            "This community advocates global coexistence, pluralism, inclusiveness and mutual respect. Stargazers of every country, region, ethnicity and cultural background may exchange here on equal terms.",
            "Users shall respect different cultures, religious beliefs and customs, and must not discriminate against, attack or insult others on grounds of nationality, race, gender, religion, region or other differences.",
            "This community is not affiliated with any state or political entity. Users shall independently comply with the laws of their location and with internationally recognized norms.",
            "When navigating cultural differences, rationality, restraint and friendliness are the baseline of exchange; together we maintain a positive atmosphere across the global community.",
          ],
        },
        {
          id: "chapter-3",
          title: "Chapter 3 Account Management",
          items: [
            "Users must provide a genuine, working email address when registering.",
            "Accounts are owned by iGCraftLit; users hold the right to use them. Transferring, renting out or selling accounts is prohibited.",
            "Users shall keep their passwords secure. Losses caused by password disclosure are borne by the users themselves.",
            "After successful registration the system automatically assigns an 11-digit iGMUid as the user's unique identifier in the community.",
          ],
        },
        {
          id: "chapter-4",
          title: "Chapter 4 Community Conduct and Legal Baselines",
          items: [
            "Users shall comply with the laws and regulations of their location and with internationally recognized legal standards, and must not use this community for any unlawful activity.",
            "Publishing, disseminating or storing the following content is strictly prohibited, including but not limited to: pornography, obscenity, vulgarity or sexually suggestive content; violence, gore, terror, cruelty, suicide or self-harm content; incitement of hatred, discrimination, ethnic antagonism or religious conflict; false information, rumors, fraud, pyramid schemes or illegal advertising; infringement of others' privacy, portrait rights, reputation rights or intellectual property rights; viruses, trojans, game cheats, malicious code or cyber-attack tools; and violations concerning the protection of minors.",
            "Spam flooding, malicious bumping, malicious reporting and other acts that disrupt community order are prohibited.",
            "Respect others and discuss rationally; personal attacks, defamation, insults and threats against others are not allowed.",
            "Engaging in any unauthorized commercial or political activity in the name of iGCraftLit is prohibited.",
          ],
        },
        {
          id: "chapter-5",
          title: "Chapter 5 Intellectual Property",
          items: [
            "The copyright of content users publish in the community belongs to the users.",
            "Users authorize iGCraftLit to display, disseminate and store that content within the community.",
            "Unauthorized reposting or plagiarism of others' original content is prohibited; offenders bear corresponding legal responsibility.",
            "Users shall ensure their published content does not infringe any third party's intellectual property rights. Should a dispute arise, the publisher bears full responsibility.",
          ],
        },
        {
          id: "chapter-6",
          title: "Chapter 6 Violations and Quantified Penalties",
          intro:
            "If a user's violations within the community are discovered by an administrator, they shall be handled in accordance with the relevant laws and regulations of the People's Republic of China and these Rules, and the following quantified penalties shall be applied to the violating account:",
          penalties: [
            {
              id: "rule-6-1",
              title: "First minor violation",
              detail: "A warning, or a 1-day mute.",
            },
            {
              id: "rule-6-2",
              title: "General violation",
              detail: "A 3-day mute.",
            },
            {
              id: "rule-6-3",
              title: "Relatively serious violation",
              detail: "A 7-day mute.",
            },
            {
              id: "rule-6-4",
              title: "Serious violation",
              detail: "A 30-day ban.",
            },
            {
              id: "rule-6-5",
              title: "Particularly serious cases",
              detail:
                "Particularly serious cases, violations of law, or repeated refusal to correct: a permanent ban, up to account deletion; the right to cooperate with law-enforcement investigations is reserved.",
            },
            {
              id: "rule-6-6",
              title: "Compensation for losses",
              detail:
                "Users who cause losses to the community or to third parties through violations shall bear corresponding liability for compensation.",
            },
          ],
        },
        {
          id: "chapter-7",
          title: "Chapter 7 Supplementary Provisions",
          items: [
            "The right of interpretation of these Rules belongs to iGCraftLit Community.",
            "These Rules take effect on the date of registration. Continued use of community services constitutes agreement to these Rules.",
            "These Rules may be updated in line with legal requirements or community development. Updates will be published in community announcements, and continued use constitutes acceptance of the updated Rules.",
          ],
        },
      ],
      faq: {
        title: "FAQ",
        items: [
          {
            id: "faq-q1",
            q: "Q1: What penalties follow a violation?",
            a: "Based on severity, administrators apply the quantified penalties in Chapter 6: a warning, 1/3/7-day mutes, a 30-day ban, a permanent ban, and ultimately account deletion. Where the law is broken, we cooperate with law-enforcement investigations.",
          },
          {
            id: "faq-q2",
            q: "Q2: Can I transfer or sell my account?",
            a: "No. Accounts are owned by iGCraftLit and users only hold usage rights. Transferring, renting out or selling accounts is prohibited.",
          },
          {
            id: "faq-q3",
            q: "Q3: What if I disagree with a penalty?",
            a: "If you object to a penalty, contact the administrators through community notifications or via igcraftlit@outlook.com to request a review. We will verify the circumstances and reply.",
          },
          {
            id: "faq-q4",
            q: "Q4: How do Rule updates take effect?",
            a: "Updates will be published in community announcements. Your continued use of community services means you accept the updated Rules.",
          },
        ],
      },
    },
  },

  ja: {
    pages: {
      userRules: {
        title: "利用規約",
        description:
          "iGCraftLit Community 利用規約の全文：世界規模での共存、アカウント管理、行動規範、知的財産および定量的処罰",
      },
    },
    auth: {
      register: {
        agreementPrefix: "私は",
        agreementRules: "iGCraftLit 利用規約",
        agreementSuffix: "を読み、これに同意します。",
        agreementRequired:
          "先に iGCraftLit 利用規約を読み、同意してください",
        rulesModal: {
          title: "iGCraftLit 利用規約",
          scrollHint: "一番下までスクロールしてお読みいただいた後に同意できます",
          finish: "読み終えました。規定を遵守します",
          cancel: "同意しない",
        },
      },
    },
    userRules: {
      title: "iGCraftLit 利用規約",
      tocTitle: "ON THIS PAGE",
      chapters: [
        {
          id: "chapter-1",
          title: "第1章 総則",
          paragraphs: [
            "iGCraftLit Community は、すべての探星者（Stargazer）に開かれたコミュニティです。私たちは夢で結ばれ、創造によって強くなり、探索の中で前進し、革新の中で突破し、真実を求める心でコミュニティを共に築きます。",
            "本コミュニティは国際的な背景のもと、世界中のユーザーに向けて、国境を越え、多様性が共存し、対等に交流できるグローバルコミュニティの構築を目指します。コミュニティの秩序を維持し、世界中のユーザーの権利と利益を保護するため、本規定を定めます。",
          ],
        },
        {
          id: "chapter-2",
          title: "第2章 世界規模での共存の原則",
          items: [
            "本コミュニティは、世界規模での共存、多様性の尊重、互いへの敬意を提唱します。国、地域、民族、文化的背景の異なる探星者が、誰でも対等に交流できます。",
            "ユーザーは異なる文化、宗教的信条、風習を尊重しなければならず、国籍、人種、性別、宗教、地域などの違いにより他人を差別、攻撃、または侮辱してはなりません。",
            "本コミュニティはいかなる国家や政治的実体にも属しません。ユーザーは、所在地の法律および国際的に通用する規範を自ら遵守しなければなりません。",
            "文化の違いを越える際には、理性、節度、友好を交流の最低ラインとし、グローバルコミュニティの良好な雰囲気を共に維持してください。",
          ],
        },
        {
          id: "chapter-3",
          title: "第3章 アカウント管理",
          items: [
            "ユーザーは登録時に、実際に使用できる有効なメールアドレスを提供しなければなりません。",
            "アカウントは iGCraftLit に帰属し、ユーザーは使用権を有します。アカウントの譲渡、賃貸、販売は禁止します。",
            "ユーザーはパスワードを適切に管理しなければならず、パスワード漏洩による損失はユーザー自身が負担します。",
            "登録完了後、システムはコミュニティにおけるユーザー固有の認証値として 11 桁の iGMUid を自動的に付与します。",
          ],
        },
        {
          id: "chapter-4",
          title: "第4章 コミュニティ行動規範と法的最低ライン",
          items: [
            "ユーザーは所在地の法令および国際的に認められた法的規範を遵守し、本コミュニティをいかなる違法活動にも利用してはなりません。",
            "以下を含む（ただしこれらに限らない）コンテンツの投稿、拡散、保存を厳禁します：ポルノ・わいせつ・低俗・性的暗示を含む内容；暴力・流血・テロ・残虐・自殺や自傷に関する内容；ヘイト、差別、民族対立、宗教紛争の扇動；虚偽情報、デマ、詐欺、マルチ商法、違法広告；他人のプライバシー、肖像権、名誉権、知的財産権の侵害；ウイルス、トロイの木馬、チートツール、悪意のあるコード、サイバー攻撃ツール；未成年者保護に関する違反内容。",
            "連投、悪意のある水増し投稿、悪意のある通報、コミュニティ秩序を乱す行為を禁止します。",
            "他人を尊重し理性的に議論し、個人攻撃、誹謗中傷、侮辱、脅迫を行ってはなりません。",
            "iGCraftLit の名において、許可のない商業活動または政治活動を行ってはなりません。",
          ],
        },
        {
          id: "chapter-5",
          title: "第5章 知的財産",
          items: [
            "ユーザーがコミュニティで公開したコンテンツの著作権は、ユーザーに帰属します。",
            "ユーザーは、当該コンテンツをコミュニティ内で表示・伝播・保存することを iGCraftLit に許諾します。",
            "無断での他人のオリジナルコンテンツの転載・盗用を禁止します。違反者は相応の法的責任を負います。",
            "ユーザーは、公開するコンテンツが第三者の知的財産権を侵害しないことを保証するものとし、紛争が生じた場合、公開者が全責任を負います。",
          ],
        },
        {
          id: "chapter-6",
          title: "第6章 違反処理と定量的処罰",
          intro:
            "ユーザーのコミュニティ内での違反行為が管理者に発見された場合、中華人民共和国の関連法令および本規定に基づいて対処し、違反アカウントに対して相応の定量的処罰を実施します：",
          penalties: [
            {
              id: "rule-6-1",
              title: "軽微な初回違反",
              detail: "警告、または 1 日間の書き込み禁止。",
            },
            {
              id: "rule-6-2",
              title: "一般的な違反",
              detail: "3 日間の書き込み禁止。",
            },
            {
              id: "rule-6-3",
              title: "比較的重い違反",
              detail: "7 日間の書き込み禁止。",
            },
            {
              id: "rule-6-4",
              title: "重大な違反",
              detail: "30 日間のアカウント停止。",
            },
            {
              id: "rule-6-5",
              title: "特に重大な場合",
              detail:
                "情状が特に重い場合、法に触れる場合、また是正を繰り返し拒む場合は、永久にアカウントを停止し、最も重い場合はアカウント削除とし、捜査機関の調査に協力する権利を留保します。",
            },
            {
              id: "rule-6-6",
              title: "損害賠償",
              detail:
                "違反行為によりコミュニティまたは第三者に損害を与えた場合、違反者は相応の賠償責任を負います。",
            },
          ],
        },
        {
          id: "chapter-7",
          title: "第7章 補則",
          items: [
            "本規定の解釈権は iGCraftLit Community に帰属します。",
            "本規定はユーザーの登録日に発効します。コミュニティサービスの継続利用は、本規定への同意とみなされます。",
            "本規定は、法的要件またはコミュニティの発展に応じて更新される場合があります。更新後はコミュニティ公告で公表し、継続利用をもって更新後の規定への同意とみなされます。",
          ],
        },
      ],
      faq: {
        title: "よくある質問",
        items: [
          {
            id: "faq-q1",
            q: "Q1: 違反するとどのような処罰を受けますか？",
            a: "管理者は違反の程度に応じて第6章の定量的処罰（警告、1日・3日・7日の書き込み禁止、30日のアカウント停止、永久停止、最も重い場合はアカウント削除）を実施します。法に触れる場合、捜査機関の調査に協力します。",
          },
          {
            id: "faq-q2",
            q: "Q2: アカウントを譲渡または販売できますか？",
            a: "できません。アカウントは iGCraftLit に帰属し、ユーザーは使用権のみを有します。譲渡、賃貸、販売は禁止されています。",
          },
          {
            id: "faq-q3",
            q: "Q3: 処罰に異議がある場合はどうすればよいですか？",
            a: "処罰に異議がある場合は、コミュニティ通知またはメール（igcraftlit@outlook.com）で管理者に再審査を申し立ててください。内容を確認のうえ回答します。",
          },
          {
            id: "faq-q4",
            q: "Q4: 規定の更新はどのように有効になりますか？",
            a: "更新内容はコミュニティ公告で公表されます。サービスを継続して利用することで、更新後の規定に同意したとみなされます。",
          },
        ],
      },
    },
  },

  ru: {
    pages: {
      userRules: {
        title: "Правила пользователей",
        description:
          "Полный текст Правил пользователей iGCraftLit Community: глобальное сосуществование, управление аккаунтами, нормы поведения, интеллектуальная собственность и количественные санкции",
      },
    },
    auth: {
      register: {
        agreementPrefix: "Я прочитал(а) и принимаю ",
        agreementRules: "Правила пользователей iGCraftLit",
        agreementSuffix: "",
        agreementRequired:
          "Сначала прочитайте и примите Правила пользователей iGCraftLit",
        rulesModal: {
          title: "Правила пользователей iGCraftLit",
          scrollHint:
            "Прокрутите текст до конца, чтобы подтвердить согласие",
          finish: "Я прочитал(а) и обязуюсь соблюдать правила",
          cancel: "Не сейчас",
        },
      },
    },
    userRules: {
      title: "Правила пользователей iGCraftLit",
      tocTitle: "ON THIS PAGE",
      chapters: [
        {
          id: "chapter-1",
          title: "Глава 1. Общие положения",
          paragraphs: [
            "iGCraftLit Community — это открытое сообщество для всех звездоискателей. Мы объединяемся мечтой, становимся сильнее благодаря творчеству, движемся вперёд в исследовании и совершаем прорывы в инновациях, сообща строя сообщество в стремлении к истине.",
            "Сообщество действует в международном контексте и обращено к пользователям всего мира, стремясь стать глобальным пространством, которое преодолевает границы, поддерживает многообразие и равноправное общение. Настоящие Правила приняты для поддержания порядка в сообществе и защиты прав и интересов пользователей во всём мире.",
          ],
        },
        {
          id: "chapter-2",
          title: "Глава 2. Принципы глобального сосуществования",
          items: [
            "Сообщество выступает за глобальное сосуществование, многообразие, инклюзивность и взаимное уважение. Звездискатели из разных стран, регионов, народов и культур могут общаться здесь на равных.",
            "Пользователи должны уважать различные культуры, религиозные убеждения и обычаи; запрещено дискриминировать, оскорблять или нападать на других по признаку национальности, расы, пола, религии, региона и иным различиям.",
            "Сообщество не принадлежит ни к одному государству или политическому образованию. Пользователи самостоятельно соблюдают законодательство своего места нахождения и общепризнанные международные нормы.",
            "Преодолевая культурные различия, следует придерживаться разумности, сдержанности и дружелюбия как минимальных норм общения, сообща поддерживая благоприятную атмосферу глобального сообщества.",
          ],
        },
        {
          id: "chapter-3",
          title: "Глава 3. Управление аккаунтами",
          items: [
            "При регистрации пользователь обязан предоставить действующий и реальный адрес электронной почты.",
            "Аккаунты принадлежат iGCraftLit, пользователь обладает правом использования. Передача, сдача в аренду и продажа аккаунтов запрещены.",
            "Пользователь обязан надёжно хранить пароль; убытки, возникшие из-за утечки пароля, несёт сам пользователь.",
            "После успешной регистрации система автоматически присваивает 11-значный iGMUid — уникальный идентификатор пользователя в сообществе.",
          ],
        },
        {
          id: "chapter-4",
          title: "Глава 4. Нормы поведения и правовые границы",
          items: [
            "Пользователи обязаны соблюдать законодательство своего места нахождения и общепризнанные международно-правовые нормы и не вправе использовать сообщество для любой противоправной деятельности.",
            "Строго запрещено публиковать, распространять и хранить, включая, но не ограничиваясь: порнографические, непристойные, вульгарные и сексуально-откровенные материалы; контент о насилии, крови, терроре, жестокости, самоубийстве и самоповреждении; разжигание ненависти, дискриминацию, межнациональную и религиозную вражду; ложную информацию, слухи, мошенничество, финансовые пирамиды, незаконную рекламу; нарушения приватности, права на изображение, репутации и интеллектуальных прав третьих лиц; вирусы, трояны, читы, вредоносный код и средства кибератак; нарушения в сфере защиты несовершеннолетних.",
            "Запрещены спам-флуд, злонамеренный набор сообщений, ложные жалобы и иные действия, нарушающие порядок сообщества.",
            "Уважайте других и ведите дискуссию разумно; запрещены личные выпады, клевета, оскорбления и угрозы в адрес других людей.",
            "Запрещено заниматься от имени iGCraftLit любой несанкционированной коммерческой или политической деятельностью.",
          ],
        },
        {
          id: "chapter-5",
          title: "Глава 5. Интеллектуальная собственность",
          items: [
            "Авторские права на контент, публикуемый пользователем в сообществе, принадлежат пользователю.",
            "Пользователь предоставляет iGCraftLit разрешение отображать, распространять и хранить этот контент в пределах сообщества.",
            "Запрещены несанкционированные перепечатка и плагиат чужого оригинального контента; нарушители несут соответствующую юридическую ответственность.",
            "Пользователь обязан обеспечивать, чтобы публикуемый контент не нарушал интеллектуальные права третьих лиц; в случае спора издатель несёт полную ответственность.",
          ],
        },
        {
          id: "chapter-6",
          title: "Глава 6. Нарушения и количественные санкции",
          intro:
            "Если нарушения пользователя в сообществе обнаружены администратором, они разбираются в соответствии с профильными законами и нормативными актами Китайской Народной Республики и настоящими Правилами, а к аккаунту нарушителя применяются следующие количественно определённые санкции:",
          penalties: [
            {
              id: "rule-6-1",
              title: "Первое незначительное нарушение",
              detail: "Предупреждение или запрет писать на 1 день.",
            },
            {
              id: "rule-6-2",
              title: "Обычное нарушение",
              detail: "Запрет писать на 3 дня.",
            },
            {
              id: "rule-6-3",
              title: "Более тяжёлое нарушение",
              detail: "Запрет писать на 7 дней.",
            },
            {
              id: "rule-6-4",
              title: "Тяжёлое нарушение",
              detail: "Блокировка на 30 дней.",
            },
            {
              id: "rule-6-5",
              title: "Особо тяжкие случаи",
              detail:
                "При особой тяжести, нарушении закона или неоднократном отказе исправиться — бессрочная блокировка, в крайнем случае удаление аккаунта; за собой сохраняется право содействовать правоохранительным органам в расследовании.",
            },
            {
              id: "rule-6-6",
              title: "Возмещение убытков",
              detail:
                "При причинении убытков сообществу или третьим лицам нарушитель несёт соответствующую ответственность по возмещению.",
            },
          ],
        },
        {
          id: "chapter-7",
          title: "Глава 7. Заключительные положения",
          items: [
            "Право толкования настоящих Правил принадлежит iGCraftLit Community.",
            "Правила вступают в силу с момента регистрации пользователя. Продолжение использования сервисов сообщества означает согласие с Правилами.",
            "Правила могут обновляться в соответствии с требованиями закона или развитием сообщества. Обновления публикуются в объявлениях сообщества; продолжение использования означает принятие обновлённых Правил.",
          ],
        },
      ],
      faq: {
        title: "Частые вопросы",
        items: [
          {
            id: "faq-q1",
            q: "Q1: Какое наказание последует за нарушение?",
            a: "В зависимости от тяжести администратор применяет количественные санкции из Главы 6: предупреждение, запрет писать на 1/3/7 дней, блокировка на 30 дней, бессрочная блокировка и в крайнем случае удаление аккаунта. При нарушении закона сообщество содействует правоохранительным органам в расследовании.",
          },
          {
            id: "faq-q2",
            q: "Q2: Можно ли передать или продать аккаунт?",
            a: "Нет. Аккаунты принадлежат iGCraftLit, пользователь обладает только правом использования. Передача, аренда и продажа аккаунтов запрещены.",
          },
          {
            id: "faq-q3",
            q: "Q3: Что делать, если я не согласен с наказанием?",
            a: "Если вы не согласны с санкцией, обратитесь к администраторам через уведомления сообщества или по почте igcraftlit@outlook.com с запросом о пересмотре — мы проверим обстоятельства и ответим.",
          },
          {
            id: "faq-q4",
            q: "Q4: Как обновления Правил вступают в силу?",
            a: "Обновления публикуются в объявлениях сообщества. Продолжение использования сервисов означает принятие обновлённых Правил.",
          },
        ],
      },
    },
  },
};

/** 深度合并（仅覆盖叶子，缺失键补齐） */
function iGM_Merge(target: iGM_Dict, patch: iGM_Dict): iGM_Dict {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const base =
        target[key] !== null && typeof target[key] === "object"
          ? (target[key] as iGM_Dict)
          : {};
      target[key] = iGM_Merge(base, value as iGM_Dict);
    } else {
      target[key] = value;
    }
  }
  return target;
}

const messagesDir = resolve(
  (import.meta as unknown as { dir: string }).dir,
  "../messages",
);
for (const [locale, payload] of Object.entries(iGM_LocalePayloads)) {
  const file = resolve(messagesDir, `${locale}.json`);
  const data = JSON.parse(readFileSync(file, "utf8")) as iGM_Dict;
  iGM_Merge(data, payload);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`[iGM_AddModule8Locales] 已写入 ${locale}.json`);
}
