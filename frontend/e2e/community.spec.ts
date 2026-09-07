import { expect, test, type Page } from "@playwright/test"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"


const screenshotDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/screenshots")

async function login(page: Page, username: "owner" | "property" | "maintenance", landingHeading: string) {
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible()
  await page.getByLabel("账号").fill(username)
  await page.getByLabel("密码").fill("123456")
  await page.getByRole("button", { name: "登录" }).click()
  await expect(page.getByRole("heading", { name: landingHeading })).toBeVisible()
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "账户菜单" }).click()
  await page.getByRole("menuitem", { name: "退出登录" }).click()
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible()
}

async function openRepair(page: Page, category: string) {
  await page.getByRole("button", { name: `查看报修：${category}` }).click()
  const detail = page.getByRole("dialog", { name: category })
  await expect(detail).toBeVisible()
  return detail
}

async function expectNoHorizontalOverflow(page: Page) {
  const layout = await page.evaluate(() => {
    const viewportWidth = window.innerWidth
    const overflowing = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => {
        const style = window.getComputedStyle(element)
        if (style.display === "none" || style.visibility === "hidden") return false
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1)
      })
      .slice(0, 10)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`)
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth,
      overflowing,
    }
  })

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth)
  expect(layout.overflowing).toEqual([])
}

test.describe.configure({ mode: "serial" })

test("production role workflow, conflict recovery, and tablet visuals", async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("pageerror", (error) => pageErrors.push(error.message))

  await test.step("direct application routes load from the production SPA", async () => {
    const response = await page.goto("/app/home")
    expect(response?.status()).toBe(200)
    await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible()
    await expect(page.getByRole("img", { name: "现代社区住宅外景" })).toHaveJSProperty("complete", true)
    await expect(page.getByRole("img", { name: "现代社区住宅外景" })).not.toHaveJSProperty("naturalWidth", 0)
  })

  await test.step("owner submits a repair", async () => {
    await login(page, "owner", "今天想做什么？")
    await page.getByRole("link", { name: "报修 提交居家维修" }).click()
    await expect(page.getByRole("heading", { name: "报修工单" })).toBeVisible()
    await page.getByRole("button", { name: "提交报修" }).click()

    const createDialog = page.getByRole("dialog", { name: "提交报修" })
    await createDialog.getByLabel("报修房屋").selectOption({ index: 1 })
    await createDialog.getByLabel("类型").selectOption("水电维修")
    await createDialog.getByLabel("优先级").selectOption("URGENT")
    await createDialog.getByLabel("问题描述").fill("E2E 厨房水龙头持续漏水")
    await createDialog.getByRole("button", { name: "提交报修" }).click()

    await expect(createDialog).toBeHidden()
    await expect(page.getByRole("button", { name: "查看报修：水电维修" })).toBeVisible()
    await logout(page)
  })

  await test.step("property assigns the repair", async () => {
    await login(page, "property", "运营首页")
    await page.getByRole("link", { name: "报修工单" }).click()
    const detail = await openRepair(page, "水电维修")
    await detail.getByRole("button", { name: "指派维修人员" }).click()

    const assignDialog = page.getByRole("dialog", { name: "指派维修人员" })
    await assignDialog.getByLabel("维修人员").selectOption({ label: "陈师傅" })
    await assignDialog.getByRole("button", { name: "确认指派" }).click()
    await expect(assignDialog).toBeHidden()
    await expect(detail.getByText("已指派给陈师傅")).toBeVisible()
    await detail.getByRole("button", { name: "关闭" }).click()
    await logout(page)
  })

  await test.step("maintenance starts and completes the repair", async () => {
    await login(page, "maintenance", "我的工单")
    const detail = await openRepair(page, "水电维修")
    await detail.getByRole("button", { name: "开始处理" }).click()
    await expect(detail.getByRole("button", { name: "完成工单" })).toBeVisible()
    await detail.getByRole("button", { name: "完成工单" }).click()

    const completeDialog = page.getByRole("dialog", { name: "完成工单" })
    await completeDialog.getByLabel("完成说明").fill("已更换水龙头阀芯并测试无渗漏")
    await completeDialog.getByRole("button", { name: "确认完成" }).click()
    await expect(completeDialog).toBeHidden()
    await expect(detail.getByText("已更换水龙头阀芯并测试无渗漏")).toBeVisible()
    await detail.getByRole("button", { name: "关闭" }).click()
    await logout(page)
  })

  await test.step("owner confirms and rates the completed repair", async () => {
    await login(page, "owner", "今天想做什么？")
    await page.getByRole("link", { name: "报修 提交居家维修" }).click()
    const detail = await openRepair(page, "水电维修")
    await detail.getByRole("button", { name: "确认完成" }).click()
    await expect(detail.getByRole("button", { name: "评价服务" })).toBeVisible()
    await detail.getByRole("button", { name: "评价服务" }).click()

    const ratingDialog = page.getByRole("dialog", { name: "评价维修服务" })
    await ratingDialog.getByLabel("评分").selectOption("5")
    await ratingDialog.getByLabel("评价内容（选填）").fill("响应及时，处理专业")
    await ratingDialog.getByRole("button", { name: "提交评价" }).click()
    await expect(ratingDialog).toBeHidden()
    await expect(detail.getByText("业主完成评价")).toBeVisible()
    await detail.getByRole("button", { name: "关闭" }).click()
  })

  await test.step("owner retries a lost payment response with the same idempotency key", async () => {
    await page.getByRole("link", { name: "社区服务" }).click()
    await page.getByRole("link", { name: /生活缴费/ }).click()
    await page.getByRole("button", { name: "查看账单：物业服务费" }).click()
    const billDetail = page.getByRole("dialog", { name: "物业服务费" })
    await billDetail.getByRole("button", { name: "确认缴费" }).click()

    const keys: string[] = []
    let committedReference = ""
    let paymentAttempt = 0
    await page.route("**/api/v1/bills/*/simulate-payment", async (route) => {
      paymentAttempt += 1
      keys.push(route.request().headers()["idempotency-key"] ?? "")
      const response = await route.fetch()
      const payload = await response.json() as { data: { paymentRef: string } }
      if (paymentAttempt === 1) {
        committedReference = payload.data.paymentRef
        await route.fulfill({
          response,
          status: 503,
          json: { code: "E2E_RESPONSE_LOST", message: "模拟网络中断", requestId: "e2e-lost-response" },
        })
      } else {
        await route.fulfill({ response })
      }
    })

    const paymentDialog = page.getByRole("dialog", { name: "确认模拟缴费" })
    await paymentDialog.getByRole("button", { name: "确认缴费" }).click()
    await expect(paymentDialog.getByRole("button", { name: "重试缴费" })).toBeVisible()
    await paymentDialog.getByRole("button", { name: "重试缴费" }).click()
    await expect(page.getByRole("dialog", { name: "缴费完成" })).toContainText(`支付参考号 ${committedReference}`)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
    await page.unroute("**/api/v1/bills/*/simulate-payment")
    await page.getByRole("dialog", { name: "缴费完成" }).getByRole("button", { name: "完成" }).click()
  })

  await test.step("owner selects a mapped space, property approves it, and cancellation releases it", async () => {
    const bookingDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    await page.getByRole("link", { name: "社区服务" }).click()
    await page.getByRole("link", { name: /车位预约/ }).click()

    await page.getByLabel("预约日期").fill(bookingDate)
    await page.getByLabel("预约时段").selectOption("09:00")
    await page.getByRole("button", { name: /A-01.*空闲/ }).click()
    await page.getByRole("button", { name: "提交预约申请" }).click()
    await expect(page.getByRole("heading", { name: "申请已提交" })).toBeVisible()
    await page.getByRole("button", { name: "继续预约" }).click()
    await expect(page.getByRole("button", { name: /A-01.*待审批/ })).toBeDisabled()

    await logout(page)
    await login(page, "property", "运营首页")
    await page.getByRole("link", { name: "停车管理" }).click()
    await page.getByRole("button", { name: "通过 A-01 的预约申请" }).click()
    await page.getByRole("dialog", { name: "通过车位预约" }).getByRole("button", { name: "确认通过" }).click()
    await expect(page.getByText("暂无待审批预约")).toBeVisible()
    await logout(page)
    await login(page, "owner", "今天想做什么？")
    await page.getByRole("link", { name: "社区服务" }).click()
    await page.getByRole("link", { name: /车位预约/ }).click()
    await page.getByLabel("预约日期").fill(bookingDate)
    await expect(page.getByRole("button", { name: /A-01.*已占用/ })).toBeDisabled()
    await page.getByRole("button", { name: "取消预约" }).click()
    const cancelDialog = page.getByRole("dialog", { name: "取消车位预约" })
    await cancelDialog.getByRole("button", { name: "确认取消" }).click()
    await expect(cancelDialog).toBeHidden()
    await expect(page.getByText("已取消", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: /A-01.*空闲/ })).toBeEnabled()
  })

  const noticeTitle = "E2E 中秋社区开放日"
  const noticeContent = "本周六上午十点开放邻里中心，欢迎居民参加。"
  await test.step("property publishes a notice", async () => {
    await logout(page)
    await login(page, "property", "运营首页")
    await page.getByRole("link", { name: "社区公告" }).click()
    await page.getByRole("button", { name: "新建公告" }).click()

    const createDialog = page.getByRole("dialog", { name: "新建公告草稿" })
    await createDialog.getByLabel("标题").fill(noticeTitle)
    await createDialog.getByLabel("内容").fill(noticeContent)
    await createDialog.getByRole("button", { name: "创建草稿" }).click()
    await expect(createDialog).toBeHidden()

    await page.getByRole("button", { name: `查看公告：${noticeTitle}` }).click()
    const noticeDialog = page.getByRole("dialog", { name: noticeTitle })
    await noticeDialog.getByRole("button", { name: "发布公告" }).click()
    await expect(noticeDialog.getByText("已发布", { exact: true })).toBeVisible()
    await noticeDialog.getByRole("button", { name: "关闭" }).click()
    await logout(page)
  })

  await test.step("owner sees the published notice", async () => {
    await login(page, "owner", "今天想做什么？")
    await page.getByRole("link", { name: "消息" }).click()
    await page.getByRole("button", { name: `查看公告：${noticeTitle}` }).click()
    const noticeDialog = page.getByRole("dialog", { name: noticeTitle })
    await expect(noticeDialog).toContainText(noticeContent)
    await expect(noticeDialog.getByText("已发布", { exact: true })).toBeVisible()
    await noticeDialog.getByRole("button", { name: "关闭" }).click()
  })

  await test.step("capture and probe tablet layouts", async () => {
    await page.getByRole("link", { name: "首页" }).click()
    await expect(page.getByText("公告已发布")).toBeHidden({ timeout: 10_000 })
    await page.setViewportSize({ width: 1024, height: 768 })
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: resolve(screenshotDirectory, "owner-home-1024x768.png"), fullPage: false })

    await page.setViewportSize({ width: 800, height: 768 })
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: resolve(screenshotDirectory, "owner-home-800x768.png"), fullPage: false })

    await logout(page)
    await login(page, "property", "运营首页")
    await page.setViewportSize({ width: 1280, height: 800 })
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: resolve(screenshotDirectory, "property-operations-1280x800.png"), fullPage: false })

    await page.setViewportSize({ width: 1366, height: 768 })
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: resolve(screenshotDirectory, "property-operations-1366x768.png"), fullPage: false })
  })

  expect(consoleErrors).toHaveLength(1)
  expect(consoleErrors.some((message) => message.includes("status of 503"))).toBe(true)
  expect(consoleErrors.filter((message) => !/status of 503/.test(message))).toEqual([])
  expect(pageErrors).toEqual([])
})
