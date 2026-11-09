<div align="center">
	<br/>
	<a href="https://github.com/Flow-Works/FlowOS">
		<img src="https://raw.githubusercontent.com/Flow-Works/FlowOS/main/public/assets/logo.svg" width="100px">
	</a>
	<h3 align="center">Flow OS</h3>
	<p align="center">
		The customizable webOS.
		<br />
    	<a href="https://flowos-thinliquid.webapp-store.de/"><strong>Explore the wiki »</strong></a>
    	<br />
    	<br />
    	<a href="https://flow-os.liquid.is-a.dev/">Try it Out</a>
    	·
    	<a href="https://github.com/Flow-Works/FlowOS/issues">Report Bug</a>
    	·
    	<a href="https://github.com/Flow-Works/FlowOS/issues">Request Feature</a>
	</p>
 	<a href="https://github.com/standard/semistandard">
  	<img src="https://raw.githubusercontent.com/standard/semistandard/master/badge.svg">
  	</a>
</div>

<details>
  	<summary>Table of Contents</summary>
  	<ol>
    	<li>
      		<a href="#built-with">Built With</a>
    	</li>
    	<li>
      		<a href="#getting-started">Getting Started</a>
      		<ul>
        		<li><a href="#prerequisites">Prerequisites</a></li>
        		<li><a href="#installation">Installation</a></li>
      		</ul>
    	</li>
    	<li><a href="#contributing">Contributing</a></li>
    	<li><a href="#license">License</a></li>
    	<li><a href="#contact">Contact</a></li>
  	</ol>
</details>

<!-- BUILT WITH -->
## Built With

Here are some libraries used to create FlowOS.

- [WinBox](https://github.com/nextapps-de/winbox)
- [Ultraviolet](https://github.com/titaniumnetwork-dev/Ultraviolet)
- [Eruda](https://github.com/liriliri/eruda)
- [BrowserFS](https://github.com/jvilk/BrowserFS)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->
## Getting Started

To get a local copy up and running follow these simple example steps.

### Prerequisites

- yarn
  ```sh
  npm install yarn@latest -g
  ```

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/Flow-Works/FlowOS
   ```
2. Install packages
   ```sh
   yarn install
   ```
3. Copy `.env.example` to `.env` and set `SITE_PASSWORD` to a long, unique password.
   The server refuses to start without a password.
4. Run
   ```sh
   yarn start
   ```
   or for Windows
   ```powershell
   yarn win
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Site password and IP lockout

All site files and the Wisp WebSocket proxy require a password login. The server
issues an HttpOnly, SameSite=Strict session cookie valid for 24 hours. Sessions
are stored in memory and expire on server restart. Passwords are never sent to
the client or stored in the lock state file.

Five failed password attempts from the same IP within 24 hours lock that IP for
24 hours from the fifth failure, including existing HTTP and new WebSocket
requests. A successful login resets the failure count. IPs shared by multiple
users share the same limit. Existing WebSocket connections are not disconnected.

Lock state is saved to `AUTH_STATE_PATH` (default `./data/auth-locks.json`) so it
survives restarts. Keep this file outside `public/`, on a persistent writable
volume. This file store supports a **single server process**; multiple instances
must use a shared atomic store before deployment.

Use HTTPS in production and set `COOKIE_SECURE=true`. Behind a reverse proxy,
set `TRUST_PROXY` to that proxy's IP addresses or CIDRs and configure the proxy to
replace forwarded headers. Forward the original Host and protocol. Without this
setting, only the direct socket IP is used; behind a proxy that would apply the
lock to all users together. Never trust arbitrary client-supplied forwarded headers.

<!-- CONTRIBUTING -->
## Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1. Fork the Project (https://github.com/Flow-Works/FlowOS/fork)
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## 🛠️ Contributors
* ThinLiquid (Original developer)
* Proudparrot2 (Ex-developer)
* Darkw4v3 (Current owner, maintainer)

  
## ❤️ Special Contributors
* [Name=Yug](https://github.com/YUG38) (Bugtester)
<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTACT -->
## Contact

[Join the Discord Server!](https://discord.gg/smBJe99X5j)



<p align="right">(<a href="#readme-top">back to top</a>)</p>
