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
3. Run
   ```sh
   yarn start
   ```
   or for Windows
   ```powershell
   yarn win
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Proxy logs and PM2

The public site uses port **3743** without a password. The password-free log viewer
uses **127.0.0.1:3744**. Proxy requests are forwarded and logged on the server;
HTTP bodies and WebSocket messages are never stored. A separate statistics tab
shows per-IP/site request counts and transferred GB. Each IP gets 3 GB per Japan
calendar day, then shares a 1 Mbps upload/download limit across all connections.
The desktop includes a usage meter and four app shortcuts; opening the browser
first shows a logging notice. Logs default to
`/mnt/timemachine/flowos-logs` on the mounted sda1 volume.

See [Ubuntu / PM2 setup](docs/PM2.md) for storage preparation, HTTPS/proxy settings,
SSH access to the viewer, boot persistence, and the exact logging scope.
For local development, use `PROXY_LOG_DIR=/tmp/flowos-logs npm start`.

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
