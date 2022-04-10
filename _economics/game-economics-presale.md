# The OSTG presale

The game commitee have organised a pre-sale, just like others on-line games selling platforms.  
We spent a lot of time and effort to find what we think is the easiest and the most fair possible way to fund our team for the hard work done so far.
> We want to achieve the best possible launch ever made for our first game!  

The presale will be done on 2 stages:
 - A whitelisted presale for selected settlers during a limited time.
 - An open pre-sale for a limited time and items for the community.

The number of available pre-sale NTFs and the time-limit for each stage will be limited at pre-sale contract creation time and set by code that we won't be able to alter after pre-sale start.  

All smart-contracts will be published here and will visible for your eyes to inspect PRIOR any pre-sale annoncement: *we do not want you to trust what we say, we want you to go online and check* we said the truth.

## How to whitelists 

There will be a whitelist of adresses and they are to be checked by smart-contract.  
To whitelist, several tasks will be given throught this very website or the discord server or the twitter of the game creators.  
## How will it work

In this pre-sale, we will allows wallets (either by whitelist and public sale) to mint the very first batch of EGA (external-game-assets).  
EGA are standard ERC-721 NFT: users having minted them are free to trade them on public platforms like OpenSea or Rarible.  

How the presale EGA are meant to be used depends on two major epochs:
1. Before the game launch date.
2. After the game launch date.

The game **launch date will be enforced by smart-contract** and we won't be able (the code won't allow anyone) to change it once annonced.  

## Before the game launch

During the pre-launch phase, EGA are normal ERC-721 NFTs that users are able to trade freely on the NFT platform of their preference.  
Pre-launch EGA differs from post-launch EGA as royalties from presale goes fully to the OSTG game commitee and have a base value.  
Post-launch EGA split royalties between the OSTG commitee, the minter and a limited number of players having interacted with the equivalent IGA (internal-game-assets) during gameplay ([more details on the second-market store](/economics/game-economics-store.html)) and have not a base value.  
During the pre-launch phase, there are not other possible use-cases for those NFT.  

## After the game launch

Once the game will launch, buyers will be able to claim IGA (internal-game-assets) via [the second-market store](/economics/game-economics-store.html) or reclaim the base value of the asset.  

Let's take as a common exemple that a wallet buy a planet for 100 MATIC in the pre-sale and the minted NFT have a base value of 90 MATIC (actual values will be displayed prior to buy on the pre-sale page).
There are multiple possibles outcomes for this user having interacted with the pre-sale:

Outcome 1:
 - Wait for the launch date.
 - Claim the planet IGA by burning the pre-sale EGA.
 - Play OSTG.

Outcome 2:
 - Wait for the launch date.
 - Reclaim the base value of 90 MATIC by burning the pre-sale EGA.

Outcome 3:
 - Trade it for 110 MATIC on OpenSea (some royalties goes to the OSTG commitee as the author of the EGA).
 - Fellow buyer can perform any previously listed outcome.

# Resume

```plantuml!
@startuml

title OSTG pre-sale

state "Pre-launch date" as BeforeLaunch {
  state "Stage 0" as S0 {
    Contract: +Availables ERC-721 OSTG Pre-sale\n+Launch date\n+Stage 1 open/close date\n+Stages 2 open/close dates\n+Price % increase ratio for each stage
    [*] --> Contract: publish pre-sale
  }
  state "Stage 1: private sell" as S1 {
    [*] --> Whitelist: invited
    [*] --> Discord: join
    [*] --> Twitter: follow
    
    Users: +invite counter\n+retweets impressions
    Discord --> Users: add new
    Twitter --> Users: retweet, follows
    
    Users --> Whitelist: wins
    Mint: /ERC-721 OSTG Presale EGA\n/ERC-721 Base Value
    Whitelist --> Mint: are allowed to 
    Mint --> [*]
  }
  state "Stage 2: public sell" as S2 {
    [*] --> Mint: NFT availables
    [*] --> [*]: NFT exhausted
  }
  note top of S2
    Mint prices are increased accordingly
    the pre-sale contract for each iteraction
  end note
  S0 --> S1
  S1 --> S2
  S2 --> S2: for each planned open-list\nstage 2 date range
  
  state markets <<fork>>
  [*] --> markets: freely trade ERC-721 OSTG Presale
  markets --> OpenSea
  markets --> Rarible
  markets --> ...
}

state "Post-lanch date" as AfterLaunch {
  state action <<fork>>
  IGA: +ERC-1155 OSTG
  [*] --> action: ERC-721 OSTG Presale EGA\n and receives either
  action --> IGA: Game assets and start to play
  action --> Airdrop: base value of ERC-721 OSTG Presale EGA
  
  Airdrop: +Base value of burned ERC-721 OSTG Presale EGA
}

BeforeLaunch --> AfterLaunch
@enduml```
