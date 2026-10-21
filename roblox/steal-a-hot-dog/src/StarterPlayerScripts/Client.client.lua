--[[
	Steal a Hot Dog - client interface.
	Builds the HUD, the shop, the sell panel and the notification toasts in code.
--]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local MarketplaceService = game:GetService("MarketplaceService")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local HotDogData = require(ReplicatedStorage:WaitForChild("HotDogData"))
local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local BuyHotDog = Remotes:WaitForChild("BuyHotDog")
local SellHotDog = Remotes:WaitForChild("SellHotDog")
local BaseUpdate = Remotes:WaitForChild("BaseUpdate")
local Notify = Remotes:WaitForChild("Notify")

local DARK = Color3.fromRGB(24, 26, 34)
local PANEL = Color3.fromRGB(32, 35, 45)
local ACCENT = Color3.fromRGB(255, 176, 60)
local GREEN = Color3.fromRGB(90, 215, 130)
local RED = Color3.fromRGB(255, 105, 105)
local TEXT = Color3.fromRGB(240, 242, 248)

local KIND_COLOR = {
	good = GREEN,
	warn = ACCENT,
	bad = RED,
	info = Color3.fromRGB(120, 190, 255),
}

local function corner(parent, radius)
	local item = Instance.new("UICorner")
	item.CornerRadius = UDim.new(0, radius or 10)
	item.Parent = parent
	return item
end

local function stroke(parent, color, thickness)
	local item = Instance.new("UIStroke")
	item.Color = color
	item.Thickness = thickness or 1
	item.Transparency = 0.35
	item.Parent = parent
	return item
end

local function padding(parent, amount)
	local item = Instance.new("UIPadding")
	item.PaddingTop = UDim.new(0, amount)
	item.PaddingBottom = UDim.new(0, amount)
	item.PaddingLeft = UDim.new(0, amount)
	item.PaddingRight = UDim.new(0, amount)
	item.Parent = parent
	return item
end

local screen = Instance.new("ScreenGui")
screen.Name = "StealAHotDog"
screen.ResetOnSpawn = false
screen.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
screen.Parent = player:WaitForChild("PlayerGui")

----------------------------------------------------------------------
-- Cash HUD
----------------------------------------------------------------------

local hud = Instance.new("Frame")
hud.Name = "Hud"
hud.Size = UDim2.fromOffset(240, 78)
hud.Position = UDim2.fromOffset(18, 18)
hud.BackgroundColor3 = DARK
hud.BackgroundTransparency = 0.1
hud.BorderSizePixel = 0
hud.Parent = screen
corner(hud, 14)
stroke(hud, ACCENT)

local cashLabel = Instance.new("TextLabel")
cashLabel.BackgroundTransparency = 1
cashLabel.Size = UDim2.new(1, -20, 0, 40)
cashLabel.Position = UDim2.fromOffset(14, 8)
cashLabel.Font = Enum.Font.GothamBold
cashLabel.TextXAlignment = Enum.TextXAlignment.Left
cashLabel.TextColor3 = TEXT
cashLabel.TextSize = 28
cashLabel.Text = "$0"
cashLabel.Parent = hud

local rateLabel = Instance.new("TextLabel")
rateLabel.BackgroundTransparency = 1
rateLabel.Size = UDim2.new(1, -20, 0, 22)
rateLabel.Position = UDim2.fromOffset(14, 46)
rateLabel.Font = Enum.Font.GothamMedium
rateLabel.TextXAlignment = Enum.TextXAlignment.Left
rateLabel.TextColor3 = GREEN
rateLabel.TextSize = 16
rateLabel.Text = "+$0 / sec"
rateLabel.Parent = hud

----------------------------------------------------------------------
-- Carry banner
----------------------------------------------------------------------

local banner = Instance.new("TextLabel")
banner.Name = "CarryBanner"
banner.AnchorPoint = Vector2.new(0.5, 0)
banner.Position = UDim2.new(0.5, 0, 0, 18)
banner.Size = UDim2.fromOffset(460, 44)
banner.BackgroundColor3 = DARK
banner.BackgroundTransparency = 0.1
banner.BorderSizePixel = 0
banner.Font = Enum.Font.GothamBold
banner.TextSize = 18
banner.TextColor3 = ACCENT
banner.Text = ""
banner.Visible = false
banner.Parent = screen
corner(banner, 12)
stroke(banner, ACCENT)

----------------------------------------------------------------------
-- Toasts
----------------------------------------------------------------------

local toasts = Instance.new("Frame")
toasts.Name = "Toasts"
toasts.AnchorPoint = Vector2.new(0.5, 1)
toasts.Position = UDim2.new(0.5, 0, 1, -130)
toasts.Size = UDim2.fromOffset(520, 220)
toasts.BackgroundTransparency = 1
toasts.Parent = screen

local toastLayout = Instance.new("UIListLayout")
toastLayout.SortOrder = Enum.SortOrder.LayoutOrder
toastLayout.VerticalAlignment = Enum.VerticalAlignment.Bottom
toastLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
toastLayout.Padding = UDim.new(0, 6)
toastLayout.Parent = toasts

local function toast(message, kind)
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromOffset(520, 36)
	label.BackgroundColor3 = DARK
	label.BackgroundTransparency = 0.12
	label.BorderSizePixel = 0
	label.Font = Enum.Font.GothamMedium
	label.TextSize = 16
	label.TextColor3 = KIND_COLOR[kind] or TEXT
	label.Text = message
	label.Parent = toasts
	corner(label, 10)

	task.delay(3.5, function()
		local tween = TweenService:Create(label, TweenInfo.new(0.4), {
			BackgroundTransparency = 1,
			TextTransparency = 1,
		})
		tween.Completed:Connect(function()
			label:Destroy()
		end)
		tween:Play()
	end)
end

----------------------------------------------------------------------
-- Panels
----------------------------------------------------------------------

local panels = {}

local function makePanel(titleText, subtitleText)
	local panel = Instance.new("Frame")
	panel.AnchorPoint = Vector2.new(0.5, 0.5)
	panel.Position = UDim2.fromScale(0.5, 0.5)
	panel.Size = UDim2.fromOffset(640, 520)
	panel.BackgroundColor3 = PANEL
	panel.BorderSizePixel = 0
	panel.Visible = false
	panel.Parent = screen
	corner(panel, 16)
	stroke(panel, ACCENT, 2)

	local title = Instance.new("TextLabel")
	title.BackgroundTransparency = 1
	title.Size = UDim2.new(1, -80, 0, 32)
	title.Position = UDim2.fromOffset(20, 14)
	title.Font = Enum.Font.GothamBold
	title.TextXAlignment = Enum.TextXAlignment.Left
	title.TextColor3 = ACCENT
	title.TextSize = 26
	title.Text = titleText
	title.Parent = panel

	local subtitle = Instance.new("TextLabel")
	subtitle.BackgroundTransparency = 1
	subtitle.Size = UDim2.new(1, -80, 0, 18)
	subtitle.Position = UDim2.fromOffset(20, 44)
	subtitle.Font = Enum.Font.GothamMedium
	subtitle.TextXAlignment = Enum.TextXAlignment.Left
	subtitle.TextColor3 = Color3.fromRGB(175, 180, 195)
	subtitle.TextSize = 14
	subtitle.Text = subtitleText
	subtitle.Parent = panel

	local close = Instance.new("TextButton")
	close.AnchorPoint = Vector2.new(1, 0)
	close.Position = UDim2.new(1, -16, 0, 16)
	close.Size = UDim2.fromOffset(38, 38)
	close.BackgroundColor3 = Color3.fromRGB(58, 62, 76)
	close.BorderSizePixel = 0
	close.Font = Enum.Font.GothamBold
	close.TextSize = 20
	close.TextColor3 = TEXT
	close.Text = "X"
	close.Parent = panel
	corner(close, 10)
	close.Activated:Connect(function()
		panel.Visible = false
	end)

	local list = Instance.new("ScrollingFrame")
	list.Position = UDim2.fromOffset(16, 72)
	list.Size = UDim2.new(1, -32, 1, -90)
	list.BackgroundTransparency = 1
	list.BorderSizePixel = 0
	list.ScrollBarThickness = 6
	list.CanvasSize = UDim2.new()
	list.AutomaticCanvasSize = Enum.AutomaticSize.Y
	list.Parent = panel

	local layout = Instance.new("UIListLayout")
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Padding = UDim.new(0, 8)
	layout.Parent = list

	table.insert(panels, panel)
	return panel, list
end

local function showPanel(target)
	local makeVisible = not target.Visible
	for _, panel in ipairs(panels) do
		panel.Visible = (panel == target) and makeVisible
	end
end

local function sideButton(text, y, color, textColor)
	local button = Instance.new("TextButton")
	button.Position = UDim2.fromOffset(18, y)
	button.Size = UDim2.fromOffset(170, 48)
	button.BackgroundColor3 = color
	button.BorderSizePixel = 0
	button.Font = Enum.Font.GothamBold
	button.TextSize = 20
	button.TextColor3 = textColor
	button.Text = text
	button.Parent = screen
	corner(button, 12)
	return button
end

----------------------------------------------------------------------
-- Shop
----------------------------------------------------------------------

local shop, shopList = makePanel("HOT DOG SHOP", "Buy a hot dog and it starts paying you every second.")

local priceButtons = {}

local function buildShopRow(info)
	local row = Instance.new("Frame")
	row.Size = UDim2.new(1, -8, 0, 76)
	row.BackgroundColor3 = Color3.fromRGB(42, 46, 58)
	row.BorderSizePixel = 0
	row.LayoutOrder = info.Index
	row.Parent = shopList
	corner(row, 12)
	stroke(row, HotDogData.RarityColor[info.Rarity] or TEXT)

	local name = Instance.new("TextLabel")
	name.BackgroundTransparency = 1
	name.Position = UDim2.fromOffset(16, 10)
	name.Size = UDim2.fromOffset(300, 26)
	name.Font = Enum.Font.GothamBold
	name.TextXAlignment = Enum.TextXAlignment.Left
	name.TextSize = 19
	name.TextColor3 = HotDogData.RarityColor[info.Rarity] or TEXT
	name.Text = info.Name
	name.Parent = row

	local detail = Instance.new("TextLabel")
	detail.BackgroundTransparency = 1
	detail.Position = UDim2.fromOffset(16, 38)
	detail.Size = UDim2.fromOffset(300, 22)
	detail.Font = Enum.Font.GothamMedium
	detail.TextXAlignment = Enum.TextXAlignment.Left
	detail.TextSize = 15
	detail.TextColor3 = GREEN
	detail.Text = string.format("%s  -  $%s / sec", info.Rarity, HotDogData.Comma(info.Income))
	detail.Parent = row

	local buy = Instance.new("TextButton")
	buy.AnchorPoint = Vector2.new(1, 0.5)
	buy.Position = UDim2.new(1, -14, 0.5, 0)
	buy.Size = UDim2.fromOffset(150, 40)
	buy.BackgroundColor3 = Color3.fromRGB(56, 140, 86)
	buy.BorderSizePixel = 0
	buy.Font = Enum.Font.GothamBold
	buy.TextSize = 17
	buy.TextColor3 = TEXT
	buy.Text = "$" .. HotDogData.Comma(info.Price)
	buy.Parent = row
	corner(buy, 10)

	buy.Activated:Connect(function()
		BuyHotDog:FireServer(info.Id)
	end)

	priceButtons[info.Id] = buy

	if info.Robux > 0 then
		buy.Size = UDim2.fromOffset(150, 30)
		buy.Position = UDim2.new(1, -14, 0.5, -17)

		local robux = Instance.new("TextButton")
		robux.AnchorPoint = Vector2.new(1, 0.5)
		robux.Position = UDim2.new(1, -14, 0.5, 19)
		robux.Size = UDim2.fromOffset(150, 30)
		robux.BackgroundColor3 = Color3.fromRGB(62, 96, 170)
		robux.BorderSizePixel = 0
		robux.Font = Enum.Font.GothamBold
		robux.TextSize = 16
		robux.TextColor3 = TEXT
		robux.Text = "R$ " .. HotDogData.Comma(info.Robux)
		robux.Parent = row
		corner(robux, 10)

		robux.Activated:Connect(function()
			if info.DevProductId == 0 then
				toast(info.Name .. ": Robux product not configured yet.", "warn")
				return
			end
			MarketplaceService:PromptProductPurchase(player, info.DevProductId)
		end)
	end
end

for _, info in ipairs(HotDogData.List) do
	buildShopRow(info)
end

----------------------------------------------------------------------
-- Sell
----------------------------------------------------------------------

local sellPanel, sellList = makePanel(
	"SELL HOT DOGS",
	string.format("Your base pays back %d%% of the cash price.", math.floor(HotDogData.SellRate * 100))
)

local emptyLabel = Instance.new("TextLabel")
emptyLabel.BackgroundTransparency = 1
emptyLabel.Size = UDim2.new(1, -8, 0, 60)
emptyLabel.Font = Enum.Font.GothamMedium
emptyLabel.TextSize = 16
emptyLabel.TextColor3 = Color3.fromRGB(165, 170, 184)
emptyLabel.Text = "Nothing on your base yet - buy or steal a hot dog first."
emptyLabel.Visible = false
emptyLabel.Parent = sellList

local function buildSellRow(entry, order)
	local info = HotDogData.ById[entry.Id]
	if not info then
		return
	end

	local payout = HotDogData.SellValue(info)

	local row = Instance.new("Frame")
	row.Size = UDim2.new(1, -8, 0, 68)
	row.BackgroundColor3 = Color3.fromRGB(42, 46, 58)
	row.BorderSizePixel = 0
	row.LayoutOrder = order
	row.Parent = sellList
	corner(row, 12)
	stroke(row, HotDogData.RarityColor[info.Rarity] or TEXT)

	local name = Instance.new("TextLabel")
	name.BackgroundTransparency = 1
	name.Position = UDim2.fromOffset(16, 9)
	name.Size = UDim2.fromOffset(320, 24)
	name.Font = Enum.Font.GothamBold
	name.TextXAlignment = Enum.TextXAlignment.Left
	name.TextSize = 18
	name.TextColor3 = HotDogData.RarityColor[info.Rarity] or TEXT
	name.Text = info.Name
	name.Parent = row

	local detail = Instance.new("TextLabel")
	detail.BackgroundTransparency = 1
	detail.Position = UDim2.fromOffset(16, 34)
	detail.Size = UDim2.fromOffset(320, 22)
	detail.Font = Enum.Font.GothamMedium
	detail.TextXAlignment = Enum.TextXAlignment.Left
	detail.TextSize = 14
	detail.TextColor3 = Color3.fromRGB(175, 180, 195)
	detail.Text = string.format("Pedestal %d  -  earning $%s / sec", entry.Slot, HotDogData.Comma(info.Income))
	detail.Parent = row

	local sell = Instance.new("TextButton")
	sell.AnchorPoint = Vector2.new(1, 0.5)
	sell.Position = UDim2.new(1, -14, 0.5, 0)
	sell.Size = UDim2.fromOffset(160, 40)
	sell.BackgroundColor3 = Color3.fromRGB(168, 78, 62)
	sell.BorderSizePixel = 0
	sell.Font = Enum.Font.GothamBold
	sell.TextSize = 17
	sell.TextColor3 = TEXT
	sell.Text = "SELL $" .. HotDogData.Comma(payout)
	sell.Parent = row
	corner(sell, 10)

	sell.Activated:Connect(function()
		sell.Active = false
		sell.Text = "SOLD"
		SellHotDog:FireServer(entry.Slot)
	end)
end

local function refreshSellPanel(contents)
	for _, child in ipairs(sellList:GetChildren()) do
		if child:IsA("Frame") then
			child:Destroy()
		end
	end

	emptyLabel.Visible = #contents == 0

	for order, entry in ipairs(contents) do
		buildSellRow(entry, order)
	end
end

BaseUpdate.OnClientEvent:Connect(function(contents)
	if type(contents) == "table" then
		refreshSellPanel(contents)
	end
end)

refreshSellPanel({})

----------------------------------------------------------------------
-- Side buttons
----------------------------------------------------------------------

local shopToggle = sideButton("SHOP", 108, ACCENT, Color3.fromRGB(28, 22, 10))
shopToggle.Activated:Connect(function()
	showPanel(shop)
end)

local sellToggle = sideButton("SELL", 164, Color3.fromRGB(168, 78, 62), TEXT)
sellToggle.Activated:Connect(function()
	showPanel(sellPanel)
end)

local help = Instance.new("TextLabel")
help.BackgroundColor3 = DARK
help.BackgroundTransparency = 0.25
help.BorderSizePixel = 0
help.Position = UDim2.fromOffset(18, 222)
help.Size = UDim2.fromOffset(250, 112)
help.Font = Enum.Font.GothamMedium
help.TextSize = 14
help.TextColor3 = Color3.fromRGB(205, 210, 222)
help.TextWrapped = true
help.TextXAlignment = Enum.TextXAlignment.Left
help.TextYAlignment = Enum.TextYAlignment.Top
help.Text = "Buy hot dogs to earn cash every second.\nHold E on someone else's hot dog to steal it, then run it onto your green DROP OFF pad.\nSELL cashes in anything on your base.\nHold E on your blue pillar to shield your base."
help.Parent = screen
corner(help, 12)
padding(help, 10)

----------------------------------------------------------------------
-- State
----------------------------------------------------------------------

local function refreshAffordable(cash)
	for id, button in pairs(priceButtons) do
		local info = HotDogData.ById[id]
		local affordable = cash >= info.Price
		button.BackgroundColor3 = affordable and Color3.fromRGB(56, 140, 86) or Color3.fromRGB(70, 74, 88)
		button.TextTransparency = affordable and 0 or 0.35
	end
end

local function watchCash()
	local stats = player:WaitForChild("leaderstats")
	local cash = stats:WaitForChild("Cash")

	local function update()
		cashLabel.Text = "$" .. HotDogData.Comma(cash.Value)
		refreshAffordable(cash.Value)
	end

	cash.Changed:Connect(update)
	update()
end

local function updateIncome()
	local income = player:GetAttribute("Income") or 0
	rateLabel.Text = "+$" .. HotDogData.Comma(income) .. " / sec"
end

local function updateCarrying()
	local carrying = player:GetAttribute("Carrying")
	if carrying and carrying ~= "" then
		banner.Visible = true
		banner.Text = "Carrying " .. carrying .. " - get it to your DROP OFF pad!"
	else
		banner.Visible = false
	end
end

task.spawn(watchCash)
player:GetAttributeChangedSignal("Income"):Connect(updateIncome)
player:GetAttributeChangedSignal("Carrying"):Connect(updateCarrying)
updateIncome()
updateCarrying()

Notify.OnClientEvent:Connect(function(message, kind)
	toast(message, kind)
end)
